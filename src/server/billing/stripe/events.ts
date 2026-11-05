import { and, asc, eq, inArray, isNull, lte, or, sql } from "drizzle-orm";
import type Stripe from "stripe";
import { billingWebhookEvents } from "@/db/schema";
import type { Db } from "@/db/types";
import { reconcileBillingAccess } from "../reconcile-access";
import { stripeLiveEnabled, type StripeConfig } from "./config";
import { reconcileStripePayment } from "./charges";
import { reconcileStripeCharge, reconcileStripeCheckout, reconcileStripeInvoice, reconcileStripeSubscription, type Reconciled } from "./reconcile";

/** Eventos que a Agenda usa; os demais são aceitos (200) e ignorados, sem guardar nada. */
export const STRIPE_EVENT_TYPES = new Set([
  "checkout.session.completed",
  "checkout.session.expired",
  "customer.subscription.created",
  "customer.subscription.updated",
  "customer.subscription.deleted",
  "invoice.finalized",
  "invoice.paid",
  "invoice.payment_failed",
  "invoice.payment_action_required",
  "invoice.marked_uncollectible",
  "invoice.voided",
  "charge.refunded",
  "charge.dispute.created",
  "payment_intent.succeeded",
  "payment_intent.processing",
  "payment_intent.payment_failed",
  "payment_intent.canceled",
]);

/** Que recurso consultar na Stripe para este evento (a disputa aponta para a cobrança). */
export function stripeEventTarget(event: Pick<Stripe.Event, "type" | "data">): string | null {
  const object = event.data.object as unknown as { id?: unknown; charge?: unknown };
  const value = event.type === "charge.dispute.created" ? object.charge : object.id;
  return typeof value === "string" && /^[A-Za-z0-9_]{1,200}$/.test(value) ? value : null;
}

/**
 * Autentica o aviso (assinatura sobre o corpo bruto) e guarda só o sinal: id do evento, tipo e id do
 * recurso, sem o conteúdo. O estado verdadeiro é consultado na API na hora de processar.
 * Eventos do outro modo (teste x real) são ignorados.
 */
export async function recordStripeEvent(
  db: Db,
  stripe: Stripe,
  input: { rawBody: string; signature: string | null; config: StripeConfig; now?: Date },
): Promise<"accepted" | "invalid" | "ignored"> {
  if (!input.signature) return "invalid";
  let event: Stripe.Event;
  try {
    event = stripe.webhooks.constructEvent(input.rawBody, input.signature, input.config.webhookSecret);
  } catch {
    return "invalid";
  }
  if (event.livemode !== input.config.live || !STRIPE_EVENT_TYPES.has(event.type)) return "ignored";
  const target = stripeEventTarget(event);
  if (!target || !/^evt_[A-Za-z0-9]{1,120}$/.test(event.id)) return "invalid";
  await db.insert(billingWebhookEvents).values({
    requestId: event.id, provider: "stripe", topic: "stripe_event", resourceId: `${event.type}:${target}`, receivedAt: input.now ?? new Date(),
  }).onConflictDoNothing();
  return "accepted";
}

async function reconcileEvent(db: Db, stripe: Stripe, type: string, target: string): Promise<Reconciled | null> {
  if (type.startsWith("checkout.session.")) return reconcileStripeCheckout(db, stripe, target);
  if (type.startsWith("customer.subscription.")) return reconcileStripeSubscription(db, stripe, target);
  if (type.startsWith("invoice.")) return reconcileStripeInvoice(db, stripe, target);
  if (type.startsWith("payment_intent.")) {
    // Pix e boleto avulsos; pagamentos de fatura de assinatura passam por aqui e são ignorados (null).
    const paid = await reconcileStripePayment(db, stripe, target);
    return paid ? { tenantId: paid.tenantId, subscriptionId: "" } : null;
  }
  if (type.startsWith("charge.")) return reconcileStripeCharge(db, stripe, target);
  return null;
}

/** O acesso só muda com cobrança real em produção, ou no modo de teste fora da produção. */
function accessEnabled(config: Pick<StripeConfig, "live">): boolean {
  return config.live ? stripeLiveEnabled() : process.env.NODE_ENV !== "production";
}

/** Processa os avisos da Stripe pendentes: idempotente, com nova tentativa e espera crescente quando falha. */
export async function processStripeEvents(db: Db, stripe: Stripe, config: Pick<StripeConfig, "live">, limit = 20): Promise<{ processed: number; failed: number }> {
  const max = Number.isFinite(limit) ? Math.max(0, Math.min(100, Math.floor(limit))) : 0;
  const result = { processed: 0, failed: 0 };
  if (!max) return result;
  const now = new Date();
  const events = await db.select().from(billingWebhookEvents)
    .where(and(eq(billingWebhookEvents.provider, "stripe"), inArray(billingWebhookEvents.topic, ["stripe_event"]), isNull(billingWebhookEvents.processedAt), or(isNull(billingWebhookEvents.nextAttemptAt), lte(billingWebhookEvents.nextAttemptAt, now))))
    .orderBy(asc(billingWebhookEvents.receivedAt), asc(billingWebhookEvents.requestId)).limit(max);
  for (const event of events) {
    const separator = event.resourceId.indexOf(":");
    const type = event.resourceId.slice(0, separator);
    const target = event.resourceId.slice(separator + 1);
    try {
      if (separator < 1 || !STRIPE_EVENT_TYPES.has(type)) throw new Error("Aviso inválido.");
      const reconciled = await reconcileEvent(db, stripe, type, target);
      if (reconciled && reconciled.subscriptionId && accessEnabled(config) && await reconcileBillingAccess(db, reconciled.tenantId) === "review") throw new Error("Acesso requer revisão.");
      const updated = await db.update(billingWebhookEvents).set({ processedAt: new Date() })
        .where(and(eq(billingWebhookEvents.requestId, event.requestId), isNull(billingWebhookEvents.processedAt))).returning({ id: billingWebhookEvents.requestId });
      if (updated.length) result.processed++;
    } catch (error) {
      console.warn(`Aviso da Stripe não processado (${type} ${target}, tentativa ${event.attempts + 1}): ${error instanceof Error ? error.message : "erro"}`);
      const delay = Math.min(60 * 60_000, 60_000 * 2 ** Math.min(event.attempts, 6));
      await db.update(billingWebhookEvents).set({ attempts: sql`${billingWebhookEvents.attempts} + 1`, nextAttemptAt: new Date(Date.now() + delay) })
        .where(and(eq(billingWebhookEvents.requestId, event.requestId), isNull(billingWebhookEvents.processedAt)));
      result.failed++;
    }
  }
  return result;
}
