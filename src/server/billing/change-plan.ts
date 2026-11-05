import { and, count, eq, inArray, isNotNull } from "drizzle-orm";
import { auditLog, billingInvoices, billingSubscriptions, memberships, plans, professionals, tenants } from "@/db/schema";
import type { Db } from "@/db/types";
import { assertBillingConfig } from "./mode";
import { paidThrough } from "./paid-through";
import { assertSandboxAccount } from "./sandbox";
import { getStripe } from "./stripe/client";
import { stripeConfig } from "./stripe/config";
import { updateStripeAmount } from "./stripe/manage";
import { validateSubscriptionIdentity } from "./subscription-validation";

type Config = { accessToken: string; collectorId: string; live?: boolean; fetcher?: typeof fetch };

/** Aplica o downgrade um dia antes da cobrança do próximo ciclo, para o novo valor já valer nela. */
const APPLY_BEFORE_MS = 86_400_000;
const NOT_PAID_YET = ["creating", "uncertain"];

/** Muda o valor das próximas cobranças da assinatura na Mercado Pago (não cobra nada na hora). */
async function updateRemoteAmount(config: Config, subscription: { id: string; providerId: string }, priceCents: number): Promise<void> {
  if (!/^[A-Za-z0-9_-]{1,200}$/.test(subscription.providerId)) throw new Error("Assinatura inválida.");
  const response = await (config.fetcher ?? fetch)(`https://api.mercadopago.com/preapproval/${encodeURIComponent(subscription.providerId)}`, {
    method: "PUT", redirect: "error", signal: AbortSignal.timeout(10_000),
    headers: { Authorization: `Bearer ${config.accessToken}`, "Content-Type": "application/json", Accept: "application/json" },
    body: JSON.stringify({ auto_recurring: { transaction_amount: priceCents / 100, currency_id: "BRL" } }),
  });
  if (!response.ok) throw new Error("Não foi possível alterar o valor agora. Tente novamente em instantes.");
  const body: unknown = await response.json();
  if (!body || typeof body !== "object" || Array.isArray(body)) throw new Error("Resposta inválida.");
  const remote = body as Record<string, unknown>;
  validateSubscriptionIdentity(remote, { reference: subscription.id, collectorId: config.collectorId, priceCents });
  if (remote.id !== subscription.providerId || remote.status !== "authorized") throw new Error("Alteração não confirmada.");
}

/** Muda o valor das próximas cobranças no provedor em que a assinatura nasceu (nunca no padrão atual). */
async function updateRemoteAmountFor(subscription: { id: string; provider: string; providerId: string }, priceCents: number, config: Config | null): Promise<void> {
  if (subscription.provider === "stripe") {
    const stripe = stripeConfig();
    if (!stripe) throw new Error("Cobrança não configurada.");
    await updateStripeAmount(getStripe(stripe), subscription, priceCents);
    return;
  }
  if (!config) throw new Error("Cobrança não configurada.");
  assertBillingConfig(config);
  if (!config.live) await assertSandboxAccount(config.accessToken, config.collectorId, config.fetcher);
  await updateRemoteAmount(config, subscription, priceCents);
}

async function activeProfessionals(db: Db, tenantId: string): Promise<number> {
  const [row] = await db.select({ n: count() }).from(professionals).where(and(eq(professionals.tenantId, tenantId), eq(professionals.active, true)));
  return Number(row?.n ?? 0);
}

export type ChangePlanResult =
  | { kind: "changed" }
  | { kind: "scheduled"; effectiveAt: Date | null };

/**
 * Troca de plano pelo dono. Sem assinatura ativa a troca vale na hora (nada é cobrado).
 * Com assinatura: aumento libera o plano novo na hora e o valor novo entra na próxima
 * cobrança; redução fica marcada para o próximo ciclo. Em qualquer redução os
 * profissionais ativos precisam caber no limite do plano menor.
 */
export async function changePlan(db: Db, input: { tenantId: string; ownerUserId: string; planId: string }, config: Config | null): Promise<ChangePlanResult> {
  const [member] = await db.select({ role: memberships.role }).from(memberships)
    .where(and(eq(memberships.tenantId, input.tenantId), eq(memberships.userId, input.ownerUserId))).limit(1);
  if (!member || member.role !== "owner") throw new Error("Acesso indisponível.");
  const [tenant] = await db.select({ planId: tenants.planId, status: tenants.status }).from(tenants).where(eq(tenants.id, input.tenantId)).limit(1);
  if (!tenant || !["trial", "active", "past_due"].includes(tenant.status)) throw new Error("Troca de plano indisponível.");
  const [current] = await db.select().from(plans).where(eq(plans.id, tenant.planId)).limit(1);
  const [target] = await db.select().from(plans).where(and(eq(plans.id, input.planId), eq(plans.active, true))).limit(1);
  if (!current || !target || target.id === current.id) throw new Error("Plano indisponível.");

  const downsizing = target.maxProfessionals !== null && (current.maxProfessionals === null || target.maxProfessionals < current.maxProfessionals);
  if (downsizing) {
    const active = await activeProfessionals(db, input.tenantId);
    if (active > target.maxProfessionals!) {
      throw new Error(`O plano ${target.name} permite até ${target.maxProfessionals} profissionais ativos e você tem ${active}. Desative ${active - target.maxProfessionals!} em Equipe para trocar.`);
    }
  }

  const subscriptions = await db.select().from(billingSubscriptions).where(eq(billingSubscriptions.tenantId, input.tenantId));
  if (subscriptions.some((item) => NOT_PAID_YET.includes(item.providerStatus))) throw new Error("Há uma contratação em análise. Aguarde ou fale com o suporte.");
  if (subscriptions.some((item) => item.providerStatus === "paused")) throw new Error("A assinatura está pausada. Fale com o suporte para trocar de plano.");
  const authorized = subscriptions.find((item) => item.providerStatus === "authorized");

  // Sem assinatura ativa: troca na hora; um checkout pendente do plano antigo deixa de valer.
  if (!authorized) {
    await db.transaction(async (tx) => {
      await tx.update(billingSubscriptions).set({ providerStatus: "abandoned", checkoutUrl: null })
        .where(and(eq(billingSubscriptions.tenantId, input.tenantId), eq(billingSubscriptions.providerStatus, "pending")));
      await tx.update(tenants).set({ planId: target.id }).where(eq(tenants.id, input.tenantId));
      await tx.insert(auditLog).values({ actorUserId: input.ownerUserId, tenantId: input.tenantId, action: "billing.plan_changed", details: { from: current.code, to: target.code, billed: false } });
    });
    return { kind: "changed" };
  }

  if (!authorized.providerId || authorized.priceCents === null) throw new Error("Assinatura inválida.");
  const invoices = await db.select({ providerStatus: billingInvoices.providerStatus, dueAt: billingInvoices.dueAt, paidAt: billingInvoices.paidAt })
    .from(billingInvoices).where(eq(billingInvoices.subscriptionId, authorized.id));

  if (target.priceCents < current.priceCents) {
    // Redução: vale no próximo ciclo.
    await db.transaction(async (tx) => {
      await tx.update(billingSubscriptions).set({ scheduledPlanId: target.id }).where(eq(billingSubscriptions.id, authorized.id));
      await tx.insert(auditLog).values({ actorUserId: input.ownerUserId, tenantId: input.tenantId, action: "billing.plan_change_scheduled", details: { from: current.code, to: target.code } });
    });
    return { kind: "scheduled", effectiveAt: paidThrough(invoices) };
  }

  // Aumento: o valor novo entra na próxima cobrança e o plano novo vale já.
  await updateRemoteAmountFor({ id: authorized.id, provider: authorized.provider, providerId: authorized.providerId }, target.priceCents, config);
  await db.transaction(async (tx) => {
    await tx.update(billingSubscriptions).set({ planId: target.id, priceCents: target.priceCents, scheduledPlanId: null }).where(eq(billingSubscriptions.id, authorized.id));
    await tx.update(tenants).set({ planId: target.id }).where(eq(tenants.id, input.tenantId));
    await tx.insert(auditLog).values({ actorUserId: input.ownerUserId, tenantId: input.tenantId, action: "billing.plan_changed", details: { from: current.code, to: target.code, billed: true } });
  });
  return { kind: "changed" };
}

/** Desfaz uma redução marcada para o próximo ciclo. */
export async function cancelScheduledPlanChange(db: Db, input: { tenantId: string; ownerUserId: string }): Promise<void> {
  const [member] = await db.select({ role: memberships.role }).from(memberships)
    .where(and(eq(memberships.tenantId, input.tenantId), eq(memberships.userId, input.ownerUserId))).limit(1);
  if (!member || member.role !== "owner") throw new Error("Acesso indisponível.");
  const updated = await db.update(billingSubscriptions).set({ scheduledPlanId: null })
    .where(and(eq(billingSubscriptions.tenantId, input.tenantId), eq(billingSubscriptions.providerStatus, "authorized"), isNotNull(billingSubscriptions.scheduledPlanId))).returning({ id: billingSubscriptions.id });
  if (!updated.length) throw new Error("Não há troca marcada.");
}

/**
 * Aplica as reduções de plano marcadas quando chega o dia anterior ao próximo ciclo.
 * Se os profissionais ativos não couberem mais no plano menor, a troca é cancelada
 * (e registrada) em vez de forçar nada.
 */
export async function applyScheduledPlanChanges(db: Db, config: Config | null, now = new Date()): Promise<{ applied: number; canceled: number; failed: number }> {
  if (config) assertBillingConfig(config);
  const result = { applied: 0, canceled: 0, failed: 0 };
  const due = await db.select().from(billingSubscriptions)
    .where(and(eq(billingSubscriptions.providerStatus, "authorized"), inArray(billingSubscriptions.tenantId, db.select({ id: tenants.id }).from(tenants).where(eq(tenants.status, "active")))))
    .limit(200);
  for (const subscription of due) {
    if (!subscription.scheduledPlanId || !subscription.providerId) continue;
    const invoices = await db.select({ providerStatus: billingInvoices.providerStatus, dueAt: billingInvoices.dueAt, paidAt: billingInvoices.paidAt })
      .from(billingInvoices).where(eq(billingInvoices.subscriptionId, subscription.id));
    const nextCharge = paidThrough(invoices);
    if (!nextCharge || nextCharge.getTime() - APPLY_BEFORE_MS > now.getTime()) continue;
    const [target] = await db.select().from(plans).where(and(eq(plans.id, subscription.scheduledPlanId), eq(plans.active, true))).limit(1);
    const cancel = async (reason: string) => {
      await db.update(billingSubscriptions).set({ scheduledPlanId: null }).where(eq(billingSubscriptions.id, subscription.id));
      await db.insert(auditLog).values({ tenantId: subscription.tenantId, action: "billing.plan_change_canceled", details: { subscriptionId: subscription.id, reason } });
      result.canceled++;
    };
    if (!target) { await cancel("plan_unavailable"); continue; }
    if (target.maxProfessionals !== null && (await activeProfessionals(db, subscription.tenantId)) > target.maxProfessionals) { await cancel("professionals_exceed_limit"); continue; }
    try {
      await updateRemoteAmountFor({ id: subscription.id, provider: subscription.provider, providerId: subscription.providerId }, target.priceCents, config);
    } catch { result.failed++; continue; }
    await db.transaction(async (tx) => {
      await tx.update(billingSubscriptions).set({ planId: target.id, priceCents: target.priceCents, scheduledPlanId: null }).where(eq(billingSubscriptions.id, subscription.id));
      await tx.update(tenants).set({ planId: target.id }).where(eq(tenants.id, subscription.tenantId));
      await tx.insert(auditLog).values({ tenantId: subscription.tenantId, action: "billing.plan_changed", details: { to: target.code, billed: true, scheduled: true } });
    });
    result.applied++;
  }
  return result;
}
