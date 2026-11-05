"use server";

import { and, eq, isNotNull } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { getDb } from "@/db/client";
import { billingSubscriptions, tenants, users } from "@/db/schema";
import { cancelSubscription } from "@/server/billing/cancel-subscription";
import { ChargeError, createCharge, type ChargeMethod } from "@/server/billing/charges";
import { cancelScheduledPlanChange, changePlan } from "@/server/billing/change-plan";
import { createSubscription } from "@/server/billing/create-subscription";
import { GatewayUnavailableError } from "@/server/billing/gateways/types";
import { resolveGateway } from "@/server/billing/gateways/router";
import { billingConfig, billingReturnUrl } from "@/server/billing/mode";
import { getStripe } from "@/server/billing/stripe/client";
import { createStripeSubscription } from "@/server/billing/stripe/checkout";
import { stripeConfig } from "@/server/billing/stripe/config";
import { cancelStripeSubscription, createStripePortalUrl } from "@/server/billing/stripe/manage";
import { requireOwner } from "@/server/settings/access";

/**
 * Contratação do plano atual por cartão. O provedor vem da configuração do superadmin, lida aqui no
 * servidor no momento de criar (nunca do navegador) e fica gravado na assinatura; checkout já aberto
 * antes de uma troca continua no provedor original.
 */
export async function startCheckout(form: FormData): Promise<void> {
  const actor = await requireOwner();
  if (actor.support) throw new Error("Indisponível no modo suporte.");
  const planId = form.get("planId");
  if (typeof planId !== "string") throw new Error("Plano inválido.");
  const db = await getDb();
  let gateway;
  try {
    gateway = await resolveGateway(db, "card");
  } catch (error) {
    if (error instanceof GatewayUnavailableError) throw new Error("Cobrança não configurada.");
    throw error;
  }
  const [tenant] = await db.select({ planId: tenants.planId, status: tenants.status }).from(tenants).where(eq(tenants.id, actor.tenantId)).limit(1);
  const [payer] = await db.select({ email: users.email }).from(users).where(and(eq(users.id, actor.userId), isNotNull(users.emailVerifiedAt))).limit(1);
  if (!tenant || !payer || !["trial", "active", "past_due"].includes(tenant.status) || tenant.planId !== planId) throw new Error("Contratação indisponível.");
  // E-mail da conta que vai pagar: o digitado, ou o do login se vier em branco (a Stripe pede o e-mail no próprio checkout).
  const typed = form.get("payerEmail");
  const payerEmail = typeof typed === "string" && typed.trim() ? typed.trim().toLowerCase() : payer.email;
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(payerEmail) || payerEmail.length > 254) throw new Error("E-mail da conta inválido.");

  if (gateway === "stripe") {
    const stripe = stripeConfig();
    const returnUrl = billingReturnUrl();
    if (!stripe || !returnUrl) throw new Error("Cobrança não configurada.");
    const { checkoutUrl } = await createStripeSubscription(db, { tenantId: actor.tenantId, planId: tenant.planId, ownerUserId: actor.userId, payerEmail, returnUrl }, getStripe(stripe));
    redirect(checkoutUrl);
  }
  const config = billingConfig();
  if (!config) throw new Error("Cobrança não configurada.");
  const { checkoutUrl } = await createSubscription(db, { tenantId: actor.tenantId, planId: tenant.planId, payerEmail, backUrl: config.backUrl, ownerUserId: actor.userId }, config);
  redirect(checkoutUrl);
}

/** Cancela a assinatura: o acesso continua até o fim do período já pago. */
export async function cancelSubscriptionAction(): Promise<void> {
  const actor = await requireOwner();
  if (actor.support) throw new Error("Indisponível no modo suporte.");
  const db = await getDb();
  // Cancela no provedor em que a assinatura nasceu, não no padrão de hoje.
  const [active] = await db.select({ provider: billingSubscriptions.provider }).from(billingSubscriptions)
    .where(and(eq(billingSubscriptions.tenantId, actor.tenantId), eq(billingSubscriptions.providerStatus, "authorized"))).limit(1);
  if (active?.provider === "stripe") {
    const stripe = stripeConfig();
    if (!stripe) throw new Error("Cobrança não configurada.");
    await cancelStripeSubscription(db, { tenantId: actor.tenantId, ownerUserId: actor.userId }, getStripe(stripe));
  } else {
    const config = billingConfig();
    if (!config) throw new Error("Cobrança não configurada.");
    await cancelSubscription(db, { tenantId: actor.tenantId, ownerUserId: actor.userId }, config);
  }
  revalidatePath("/painel/configuracoes/assinatura");
}

/** Abre o portal da Stripe (atualizar cartão e ver faturas) para quem assinou por ela. */
export async function openCardPortalAction(): Promise<void> {
  const actor = await requireOwner();
  if (actor.support) throw new Error("Indisponível no modo suporte.");
  const stripe = stripeConfig();
  const returnUrl = billingReturnUrl();
  if (!stripe || !returnUrl) throw new Error("Cobrança não configurada.");
  const [row] = await (await getDb()).select({ customer: billingSubscriptions.providerCustomerId }).from(billingSubscriptions)
    .where(and(eq(billingSubscriptions.tenantId, actor.tenantId), eq(billingSubscriptions.provider, "stripe"), eq(billingSubscriptions.providerStatus, "authorized"))).limit(1);
  if (!row?.customer) throw new Error("Não há assinatura da Stripe ativa.");
  redirect(await createStripePortalUrl(getStripe(stripe), row.customer, returnUrl));
}

/** Troca de plano: aumento vale na hora (valor novo na próxima cobrança); redução fica para o próximo ciclo. */
export async function changePlanAction(form: FormData): Promise<void> {
  const actor = await requireOwner();
  if (actor.support) throw new Error("Indisponível no modo suporte.");
  const planId = form.get("planId");
  if (typeof planId !== "string") throw new Error("Plano inválido.");
  await changePlan(await getDb(), { tenantId: actor.tenantId, ownerUserId: actor.userId, planId }, billingConfig());
  revalidatePath("/painel", "layout");
}

export async function undoPlanChangeAction(): Promise<void> {
  const actor = await requireOwner();
  if (actor.support) throw new Error("Indisponível no modo suporte.");
  await cancelScheduledPlanChange(await getDb(), { tenantId: actor.tenantId, ownerUserId: actor.userId });
  revalidatePath("/painel/configuracoes/assinatura");
}

export type ChargeFormState = { ok?: boolean; error?: string; fieldErrors?: Record<string, string>; at?: number };

/** Gera o Pix ou o boleto do mês (o valor é o do plano atual, definido no servidor). */
export async function startChargeAction(_previous: ChargeFormState, form: FormData): Promise<ChargeFormState> {
  const actor = await requireOwner();
  if (actor.support) return { error: "Indisponível no modo suporte.", at: Date.now() };
  const config = billingConfig();
  if (!config) return { error: "A cobrança ainda não está disponível.", at: Date.now() };
  const method = form.get("method");
  if (method !== "pix" && method !== "boleto") return { error: "Escolha Pix ou boleto.", at: Date.now() };
  const db = await getDb();
  // Pix e boleto só existem na Mercado Pago; o roteador confirma que o padrão de hoje consegue gerar.
  try {
    if ((await resolveGateway(db, method)) !== "mercadopago") return { error: "A cobrança ainda não está disponível.", at: Date.now() };
  } catch (error) {
    if (error instanceof GatewayUnavailableError) return { error: "A cobrança ainda não está disponível.", at: Date.now() };
    throw error;
  }
  const [user] = await db.select({ verified: users.emailVerifiedAt }).from(users).where(eq(users.id, actor.userId)).limit(1);
  if (!user?.verified) return { error: "Confirme o seu e-mail antes de pagar.", at: Date.now() };
  const payer = method === "boleto"
    ? Object.fromEntries(["name", "document", "zipCode", "street", "number", "neighborhood", "city", "state"].map((key) => [key, form.get(key) ?? ""]))
    : undefined;
  try {
    await createCharge(db, { tenantId: actor.tenantId, ownerUserId: actor.userId, method: method as ChargeMethod, payer }, config);
  } catch (error) {
    if (error instanceof ChargeError) return { error: error.message, fieldErrors: error.fieldErrors, at: Date.now() };
    console.error("Falha ao gerar cobrança avulsa", error instanceof Error ? error.message : "erro");
    return { error: "Não foi possível gerar agora. Tente novamente em instantes.", at: Date.now() };
  }
  revalidatePath("/painel/configuracoes/assinatura");
  return { ok: true, at: Date.now() };
}
