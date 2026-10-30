import { and, eq, inArray, sql } from "drizzle-orm";
import { billingSubscriptions, memberships, plans, tenants } from "@/db/schema";
import type { Db } from "@/db/types";
import { validatePendingSubscription } from "./subscription-validation";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Somente testes. O chamador deve autenticar o dono e obter o e-mail no servidor. */
export async function createTestSubscription(db: Db, input: {
  tenantId: string; planId: string; payerEmail: string; backUrl: string; ownerUserId?: string;
}, config: { accessToken: string; collectorId: string; fetcher?: typeof fetch }): Promise<{ checkoutUrl: string }> {
  if (process.env.NODE_ENV === "production" || !config.accessToken.startsWith("TEST-") || !config.collectorId) throw new Error("Cobrança de teste não configurada.");
  if (!UUID.test(input.tenantId) || !UUID.test(input.planId) || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(input.payerEmail) || input.payerEmail.length > 254) throw new Error("Dados inválidos.");
  let back: URL;
  try { back = new URL(input.backUrl); } catch { throw new Error("Endereço de retorno inválido."); }
  if (back.protocol !== "https:" || back.username || back.password) throw new Error("Endereço de retorno inválido.");
  const reserved = await db.transaction(async (tx) => {
    await tx.execute(sql`select pg_advisory_xact_lock(hashtext(${input.tenantId}))`);
    const [tenant] = await tx.select({ id: tenants.id, planId: tenants.planId, status: tenants.status }).from(tenants).where(eq(tenants.id, input.tenantId)).limit(1).for("update");
    if (input.ownerUserId) {
      const [member] = await tx.select({ role: memberships.role }).from(memberships).where(and(eq(memberships.tenantId, input.tenantId), eq(memberships.userId, input.ownerUserId))).limit(1).for("update");
      if (!member || member.role !== "owner") throw new Error("Acesso indisponível.");
    }
    const [plan] = await tx.select().from(plans).where(and(eq(plans.id, input.planId), eq(plans.active, true))).limit(1).for("share");
    if (!tenant || tenant.planId !== input.planId || !["trial", "active", "past_due"].includes(tenant.status) || !plan || plan.priceCents <= 0) throw new Error("Plano indisponível.");
    const [existing] = await tx.select({ id: billingSubscriptions.id }).from(billingSubscriptions)
      .where(and(eq(billingSubscriptions.tenantId, input.tenantId), inArray(billingSubscriptions.providerStatus, ["creating", "uncertain", "pending", "authorized", "paused"]))).limit(1);
    if (existing) throw new Error("Já existe uma assinatura ou tentativa em análise.");
    const [subscription] = await tx.insert(billingSubscriptions).values({ tenantId: input.tenantId, planId: plan.id, priceCents: plan.priceCents, providerStatus: "creating" }).returning({ id: billingSubscriptions.id });
    return { id: subscription.id, priceCents: plan.priceCents, name: plan.name };
  });
  try {
    const response = await (config.fetcher ?? fetch)("https://api.mercadopago.com/preapproval", {
      method: "POST", redirect: "error", signal: AbortSignal.timeout(10_000),
      headers: { Authorization: `Bearer ${config.accessToken}`, "Content-Type": "application/json", Accept: "application/json" },
      body: JSON.stringify({ reason: `Eneven - ${reserved.name}`, external_reference: reserved.id, payer_email: input.payerEmail, auto_recurring: { frequency: 1, frequency_type: "months", transaction_amount: reserved.priceCents / 100, currency_id: "BRL" }, back_url: back.toString(), status: "pending" }),
    });
    if (!response.ok) throw new Error("Falha ao criar assinatura.");
    const body: unknown = await response.json();
    if (!body || typeof body !== "object" || Array.isArray(body)) throw new Error("Resposta inválida.");
    const result = validatePendingSubscription(body as Record<string, unknown>, { reference: reserved.id, collectorId: config.collectorId, priceCents: reserved.priceCents });
    const updated = await db.update(billingSubscriptions).set({ providerId: result.id, providerStatus: "pending", checkoutUrl: result.checkoutUrl }).where(and(eq(billingSubscriptions.id, reserved.id), eq(billingSubscriptions.providerStatus, "creating"))).returning({ id: billingSubscriptions.id });
    if (!updated.length) throw new Error("Tentativa indisponível.");
    return { checkoutUrl: result.checkoutUrl };
  } catch {
    // Mesmo um timeout pode ocorrer após o provedor criar a assinatura.
    await db.update(billingSubscriptions).set({ providerStatus: "uncertain" }).where(and(eq(billingSubscriptions.id, reserved.id), eq(billingSubscriptions.providerStatus, "creating")));
    throw new Error("Não foi possível confirmar a criação; revise a ocorrência antes de tentar novamente.");
  }
}
