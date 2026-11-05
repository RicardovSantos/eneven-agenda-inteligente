import { and, eq } from "drizzle-orm";
import type Stripe from "stripe";
import { auditLog, billingCharges, billingInvoices, billingPaymentAttempts, billingSubscriptions } from "@/db/schema";
import type { Db } from "@/db/types";
import { paidThrough } from "../paid-through";
import { idOf } from "./client";
import { META_SUBSCRIPTION, META_TENANT } from "./checkout";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Estados da Stripe → os mesmos estados internos da assinatura (os que o resto da cobrança já entende). */
export function mapSubscriptionStatus(sub: Pick<Stripe.Subscription, "status" | "cancel_at_period_end">): "pending" | "authorized" | "cancelled" {
  if (sub.status === "canceled" || sub.status === "incomplete_expired") return "cancelled";
  if (sub.cancel_at_period_end) return "cancelled";
  if (sub.status === "incomplete") return "pending";
  // active, trialing, past_due, unpaid, paused: continua "autorizada"; a falta de pagamento aparece na fatura recusada e vira atraso/carência.
  return "authorized";
}

function periodEnd(sub: Stripe.Subscription): Date | null {
  const ends = sub.items.data.map((item) => item.current_period_end).filter((value): value is number => typeof value === "number");
  return ends.length ? new Date(Math.max(...ends) * 1000) : null;
}

/** Confere que o objeto da Stripe é mesmo desta assinatura: ids, estabelecimento, valor, moeda e periodicidade. */
function assertSubscriptionMatches(sub: Stripe.Subscription, row: { id: string; tenantId: string; priceCents: number | null }) {
  const item = sub.items.data[0];
  const price = item?.price;
  if (sub.items.data.length !== 1 || !price || row.priceCents === null) throw new Error("Cobrança inválida.");
  if (sub.metadata?.[META_SUBSCRIPTION] !== row.id || sub.metadata?.[META_TENANT] !== row.tenantId) throw new Error("Resposta inválida.");
  if (price.currency !== "brl" || price.unit_amount !== row.priceCents || price.recurring?.interval !== "month" || price.recurring?.interval_count !== 1) throw new Error("Cobrança inválida.");
}

export type Reconciled = { tenantId: string; subscriptionId: string };

/** Atualiza a assinatura daqui com o estado oficial da Stripe (consultado agora, não o do aviso). */
export async function reconcileStripeSubscription(db: Db, stripe: Stripe, stripeSubscriptionId: string, now = new Date()): Promise<Reconciled> {
  if (!/^sub_[A-Za-z0-9]{1,120}$/.test(stripeSubscriptionId)) throw new Error("Identificador inválido.");
  const sub = await stripe.subscriptions.retrieve(stripeSubscriptionId);
  const internalId = sub.metadata?.[META_SUBSCRIPTION];
  if (sub.id !== stripeSubscriptionId || typeof internalId !== "string" || !UUID.test(internalId)) throw new Error("Assinatura não vinculada.");
  const customerId = idOf(sub.customer);
  if (!customerId) throw new Error("Resposta inválida.");
  return db.transaction(async (tx) => {
    const [row] = await tx.select().from(billingSubscriptions).where(eq(billingSubscriptions.id, internalId)).limit(1).for("update");
    if (!row || row.provider !== "stripe") throw new Error("Assinatura não vinculada.");
    assertSubscriptionMatches(sub, row);
    // O id do checkout (`cs_…`) dá lugar ao da assinatura; qualquer outro id diferente é ambíguo.
    if (row.providerId && row.providerId !== sub.id && !row.providerId.startsWith("cs_")) throw new Error("Atualização ambígua.");
    const status = mapSubscriptionStatus(sub);
    let accessUntil: Date | null = null;
    if (status === "cancelled") {
      if (sub.cancel_at_period_end && sub.status !== "canceled") accessUntil = periodEnd(sub);
      else {
        const invoices = await tx.select({ providerStatus: billingInvoices.providerStatus, dueAt: billingInvoices.dueAt, paidAt: billingInvoices.paidAt }).from(billingInvoices).where(eq(billingInvoices.subscriptionId, row.id));
        accessUntil = row.accessUntil ?? paidThrough(invoices);
      }
    }
    await tx.update(billingSubscriptions).set({
      providerId: sub.id, providerCustomerId: customerId, providerStatus: status, providerUpdatedAt: now,
      checkoutUrl: status === "pending" ? row.checkoutUrl : null, accessUntil,
    }).where(eq(billingSubscriptions.id, row.id));
    return { tenantId: row.tenantId, subscriptionId: row.id };
  });
}

/**
 * Checkout concluído liga a assinatura criada; checkout expirado sem pagamento encerra a tentativa
 * (o link deixa de valer e o dono pode assinar de novo).
 */
export async function reconcileStripeCheckout(db: Db, stripe: Stripe, sessionId: string): Promise<Reconciled | null> {
  if (!/^cs_[A-Za-z0-9_]{1,200}$/.test(sessionId)) throw new Error("Identificador inválido.");
  const session = await stripe.checkout.sessions.retrieve(sessionId);
  const internalId = session.client_reference_id;
  if (session.id !== sessionId || !internalId || !UUID.test(internalId)) throw new Error("Assinatura não vinculada.");
  const subId = idOf(session.subscription);
  if (session.status === "complete" && subId) return reconcileStripeSubscription(db, stripe, subId);
  if (session.status === "expired") {
    return db.transaction(async (tx) => {
      const [row] = await tx.select().from(billingSubscriptions).where(eq(billingSubscriptions.id, internalId)).limit(1).for("update");
      if (!row || row.provider !== "stripe" || row.providerId !== sessionId) throw new Error("Assinatura não vinculada.");
      if (row.providerStatus === "pending") await tx.update(billingSubscriptions).set({ providerStatus: "cancelled", checkoutUrl: null, providerUpdatedAt: new Date() }).where(eq(billingSubscriptions.id, row.id));
      return { tenantId: row.tenantId, subscriptionId: row.id };
    });
  }
  return null;
}

function invoiceState(invoice: Stripe.Invoice): { status: "pending" | "rejected" | "approved"; paidAt: Date | null } | null {
  if (invoice.status === "paid") return { status: "approved", paidAt: invoice.status_transitions?.paid_at ? new Date(invoice.status_transitions.paid_at * 1000) : new Date() };
  if (invoice.status === "open") return { status: invoice.attempt_count > 0 ? "rejected" : "pending", paidAt: null };
  if (invoice.status === "uncollectible" || invoice.status === "void") return { status: "rejected", paidAt: null };
  return null; // rascunho: ainda não é uma cobrança
}

function paymentIdOf(invoice: Stripe.Invoice): string {
  for (const item of invoice.payments?.data ?? []) {
    const payment = item.payment;
    const id = idOf(payment?.payment_intent) ?? idOf(payment?.charge);
    if (id) return id;
  }
  return `stripe_${invoice.id}`;
}

/** Guarda a fatura da Stripe como fatura da assinatura daqui (aprovada, recusada ou pendente), sem inventar pagamento. */
export async function reconcileStripeInvoice(db: Db, stripe: Stripe, invoiceId: string, now = new Date()): Promise<Reconciled | null> {
  if (!/^in_[A-Za-z0-9]{1,120}$/.test(invoiceId)) throw new Error("Identificador inválido.");
  const invoice = await stripe.invoices.retrieve(invoiceId, { expand: ["payments"] });
  const subId = idOf(invoice.parent?.subscription_details?.subscription);
  const state = invoiceState(invoice);
  if (invoice.id !== invoiceId || !subId) return null; // não é fatura de assinatura
  // Liga a assinatura antes (o aviso da fatura pode chegar antes do aviso do checkout).
  const linked = await reconcileStripeSubscription(db, stripe, subId, now);
  if (!state) return linked;
  return db.transaction(async (tx) => {
    const [row] = await tx.select().from(billingSubscriptions).where(eq(billingSubscriptions.id, linked.subscriptionId)).limit(1).for("update");
    if (!row || row.provider !== "stripe" || row.providerId !== subId || row.priceCents === null) throw new Error("Assinatura não vinculada.");
    if (invoice.currency !== "brl" || invoice.total !== row.priceCents) throw new Error("Valor de fatura inválido.");
    const dueSeconds = invoice.due_date ?? invoice.status_transitions?.finalized_at ?? invoice.created;
    const values = {
      paymentId: state.status === "pending" ? null : paymentIdOf(invoice), providerStatus: state.status, amountCents: invoice.total,
      dueAt: new Date(dueSeconds * 1000), paidAt: state.paidAt, providerUpdatedAt: state.status === "pending" ? null : now, invoiceUpdatedAt: now,
    };
    const [found] = await tx.select().from(billingInvoices).where(eq(billingInvoices.providerId, invoice.id)).limit(1).for("update");
    if (found && (found.subscriptionId !== row.id || found.tenantId !== row.tenantId)) throw new Error("Fatura vinculada a outro estabelecimento.");
    // Uma fatura já aprovada não volta atrás por aviso atrasado.
    if (found?.providerStatus === "approved" && state.status !== "approved") return linked;
    if (found) await tx.update(billingInvoices).set(values).where(eq(billingInvoices.id, found.id));
    else await tx.insert(billingInvoices).values({ tenantId: row.tenantId, subscriptionId: row.id, providerId: invoice.id, ...values });
    return linked;
  });
}

/**
 * Reembolso ou contestação: registra a tentativa como `refunded`/`charged_back` na fatura, o que leva
 * o acesso para revisão (nunca muda sozinho), como já é no Mercado Pago.
 */
export async function reconcileStripeCharge(db: Db, stripe: Stripe, chargeId: string, now = new Date()): Promise<Reconciled | null> {
  if (!/^(ch|py)_[A-Za-z0-9]{1,120}$/.test(chargeId)) throw new Error("Identificador inválido.");
  const charge = await stripe.charges.retrieve(chargeId);
  const status = charge.disputed ? "charged_back" : charge.refunded || charge.amount_refunded > 0 ? "refunded" : null;
  const paymentIntent = idOf(charge.payment_intent);
  if (charge.id !== chargeId || !status || !paymentIntent) return null;
  return db.transaction(async (tx) => {
    const [invoice] = await tx.select().from(billingInvoices).where(eq(billingInvoices.paymentId, paymentIntent)).limit(1).for("update");
    if (!invoice) {
      // Pix ou boleto avulso: só registra o reembolso/contestação (e audita), sem mexer no acesso, como no Mercado Pago.
      const [avulso] = await tx.select().from(billingCharges).where(and(eq(billingCharges.provider, "stripe"), eq(billingCharges.providerPaymentId, paymentIntent))).limit(1).for("update");
      if (!avulso) throw new Error("Pagamento não corresponde à fatura.");
      if (avulso.status !== status) {
        await tx.update(billingCharges).set({ status, providerUpdatedAt: now }).where(eq(billingCharges.id, avulso.id));
        await tx.insert(auditLog).values({ tenantId: avulso.tenantId, action: "billing.charge_disputed", details: { method: avulso.method, status, provider: "stripe" } });
      }
      return { tenantId: avulso.tenantId, subscriptionId: "" };
    }
    const values = { status, providerUpdatedAt: now, paidAt: null };
    const [prior] = await tx.select().from(billingPaymentAttempts).where(eq(billingPaymentAttempts.paymentId, chargeId)).limit(1);
    if (prior) await tx.update(billingPaymentAttempts).set(values).where(eq(billingPaymentAttempts.paymentId, chargeId));
    else await tx.insert(billingPaymentAttempts).values({ paymentId: chargeId, tenantId: invoice.tenantId, invoiceId: invoice.id, ...values });
    return { tenantId: invoice.tenantId, subscriptionId: invoice.subscriptionId };
  });
}

/** Útil para conferir no painel: o estabelecimento de uma assinatura da Stripe pelo id dela. */
export async function findStripeSubscriptionRow(db: Db, stripeSubscriptionId: string) {
  const [row] = await db.select().from(billingSubscriptions).where(and(eq(billingSubscriptions.provider, "stripe"), eq(billingSubscriptions.providerId, stripeSubscriptionId))).limit(1);
  return row ?? null;
}
