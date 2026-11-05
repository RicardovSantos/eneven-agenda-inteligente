import { and, eq } from "drizzle-orm";
import type Stripe from "stripe";
import { auditLog, billingInvoices, billingSubscriptions, memberships } from "@/db/schema";
import type { Db } from "@/db/types";
import { paidThrough } from "../paid-through";
import { idOf } from "./client";
import { META_SUBSCRIPTION } from "./checkout";

const CHECKOUT_HOST = /(^|\.)stripe\.com$/;

function periodEnd(sub: Stripe.Subscription): Date | null {
  const ends = sub.items.data.map((item) => item.current_period_end).filter((value): value is number => typeof value === "number");
  return ends.length ? new Date(Math.max(...ends) * 1000) : null;
}

/**
 * Cancela no fim do período já pago (`cancel_at_period_end`), como no Mercado Pago: o acesso
 * continua até lá, sem reembolso. A Stripe é consultada primeiro; se falhar, nada muda aqui.
 */
export async function cancelStripeSubscription(db: Db, input: { tenantId: string; ownerUserId: string }, stripe: Stripe, now = new Date()): Promise<{ accessUntil: Date | null }> {
  const [member] = await db.select({ role: memberships.role }).from(memberships)
    .where(and(eq(memberships.tenantId, input.tenantId), eq(memberships.userId, input.ownerUserId))).limit(1);
  if (!member || member.role !== "owner") throw new Error("Acesso indisponível.");
  const [row] = await db.select().from(billingSubscriptions)
    .where(and(eq(billingSubscriptions.tenantId, input.tenantId), eq(billingSubscriptions.provider, "stripe"), eq(billingSubscriptions.providerStatus, "authorized"))).limit(1);
  if (!row || !row.providerId?.startsWith("sub_")) throw new Error("Não há assinatura ativa para cancelar.");

  let updated: Stripe.Subscription;
  try {
    updated = await stripe.subscriptions.update(row.providerId, { cancel_at_period_end: true });
  } catch {
    throw new Error("Não foi possível cancelar agora. Tente novamente em instantes.");
  }
  if (updated.id !== row.providerId || updated.metadata?.[META_SUBSCRIPTION] !== row.id || !updated.cancel_at_period_end) throw new Error("Cancelamento não confirmado.");

  return db.transaction(async (tx) => {
    const invoices = await tx.select({ providerStatus: billingInvoices.providerStatus, dueAt: billingInvoices.dueAt, paidAt: billingInvoices.paidAt }).from(billingInvoices).where(eq(billingInvoices.subscriptionId, row.id));
    const accessUntil = periodEnd(updated) ?? paidThrough(invoices);
    await tx.update(billingSubscriptions).set({ providerStatus: "cancelled", providerUpdatedAt: now, accessUntil, checkoutUrl: null }).where(eq(billingSubscriptions.id, row.id));
    await tx.insert(auditLog).values({ actorUserId: input.ownerUserId, tenantId: input.tenantId, action: "billing.subscription_canceled", details: { subscriptionId: row.id, provider: "stripe", accessUntil: accessUntil?.toISOString() ?? null } });
    return { accessUntil };
  });
}

/** Muda o valor das próximas cobranças (sem cobrança proporcional agora), igual ao que se faz no Mercado Pago. */
export async function updateStripeAmount(stripe: Stripe, subscription: { id: string; providerId: string }, priceCents: number): Promise<void> {
  if (!subscription.providerId.startsWith("sub_") || !Number.isSafeInteger(priceCents) || priceCents <= 0) throw new Error("Assinatura inválida.");
  const current = await stripe.subscriptions.retrieve(subscription.providerId);
  const item = current.items.data[0];
  const product = idOf(item?.price?.product);
  if (current.items.data.length !== 1 || !item || !product || current.metadata?.[META_SUBSCRIPTION] !== subscription.id) throw new Error("Assinatura inválida.");
  let updated: Stripe.Subscription;
  try {
    updated = await stripe.subscriptions.update(subscription.providerId, {
      items: [{ id: item.id, price_data: { currency: "brl", product, unit_amount: priceCents, recurring: { interval: "month" } } }],
      proration_behavior: "none",
    });
  } catch {
    throw new Error("Não foi possível alterar o valor agora. Tente novamente em instantes.");
  }
  const price = updated.items.data[0]?.price;
  if (updated.id !== subscription.providerId || updated.items.data.length !== 1 || price?.unit_amount !== priceCents || price?.currency !== "brl") throw new Error("Alteração não confirmada.");
}

/** Link do portal da Stripe (atualizar cartão, ver faturas). O portal precisa estar configurado no painel da Stripe. */
export async function createStripePortalUrl(stripe: Stripe, customerId: string, returnUrl: string): Promise<string> {
  if (!/^cus_[A-Za-z0-9]{1,120}$/.test(customerId)) throw new Error("Cliente inválido.");
  const session = await stripe.billingPortal.sessions.create({ customer: customerId, return_url: returnUrl });
  let url: URL;
  try { url = new URL(session.url); } catch { throw new Error("Resposta inválida."); }
  if (url.protocol !== "https:" || url.username || url.password || !CHECKOUT_HOST.test(url.hostname)) throw new Error("Resposta inválida.");
  return url.toString();
}
