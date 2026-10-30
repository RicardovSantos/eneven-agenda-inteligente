import { and, asc, eq, inArray, isNull, lte, or, sql } from "drizzle-orm";
import { billingInvoices, billingPaymentAttempts, billingSubscriptions, billingWebhookEvents } from "@/db/schema";
import type { Db } from "@/db/types";
import { reconcilePayment } from "./reconcile-payment";
import { reconcileSubscription } from "./reconcile-subscription";
import { reconcileAuthorizedInvoice } from "./reconcile-invoice";
import { reconcileTestBillingAccess } from "./reconcile-access";

/** Processa sinais; altera acesso somente em ambiente de teste com credencial TEST. */
export async function processPaymentEvents(db: Db, config: {
  accessToken: string; collectorId: string; liveMode: boolean; fetcher?: typeof fetch;
}, limit = 20): Promise<{ processed: number; failed: number }> {
  if (!config.accessToken || !config.collectorId || typeof config.liveMode !== "boolean") throw new Error("Configuração de cobrança incompleta.");
  const max = Number.isFinite(limit) ? Math.max(0, Math.min(100, Math.floor(limit))) : 0;
  if (!max) return { processed: 0, failed: 0 };
  const now = new Date();
  const events = await db.select().from(billingWebhookEvents)
    .where(and(inArray(billingWebhookEvents.topic, ["payment", "subscription_preapproval", "subscription_authorized_payment"]), isNull(billingWebhookEvents.processedAt), or(isNull(billingWebhookEvents.nextAttemptAt), lte(billingWebhookEvents.nextAttemptAt, now))))
    .orderBy(asc(billingWebhookEvents.receivedAt), asc(billingWebhookEvents.requestId)).limit(max);
  const result = { processed: 0, failed: 0 };
  for (const event of events) {
    try {
      if (event.topic === "payment") await reconcilePayment(db, event.resourceId, config);
      else if (event.topic === "subscription_preapproval") await reconcileSubscription(db, event.resourceId, config);
      else {
        const { paymentId } = await reconcileAuthorizedInvoice(db, event.resourceId, config);
        if (paymentId) await reconcilePayment(db, paymentId, config);
      }
      if (process.env.NODE_ENV !== "production" && !config.liveMode && config.accessToken.startsWith("TEST-")) {
        let tenantId: string | undefined;
        if (event.topic === "payment") {
          const [attempt] = await db.select({ tenantId: billingPaymentAttempts.tenantId }).from(billingPaymentAttempts).where(eq(billingPaymentAttempts.paymentId, event.resourceId)).limit(1);
          tenantId = attempt?.tenantId;
        } else if (event.topic === "subscription_preapproval") {
          const [subscription] = await db.select({ tenantId: billingSubscriptions.tenantId }).from(billingSubscriptions).where(eq(billingSubscriptions.providerId, event.resourceId)).limit(1);
          tenantId = subscription?.tenantId;
        } else {
          const [invoice] = await db.select({ tenantId: billingInvoices.tenantId }).from(billingInvoices).where(eq(billingInvoices.providerId, event.resourceId)).limit(1);
          tenantId = invoice?.tenantId;
        }
        if (!tenantId || await reconcileTestBillingAccess(db, tenantId) === "review") throw new Error("Acesso requer revisão.");
      }
      const updated = await db.update(billingWebhookEvents).set({ processedAt: new Date() })
        .where(and(eq(billingWebhookEvents.requestId, event.requestId), isNull(billingWebhookEvents.processedAt)))
        .returning({ id: billingWebhookEvents.requestId });
      if (updated.length) result.processed++;
    } catch {
      // Permanece pendente para revisão e nova tentativa; nenhum payload é registrado no log.
      const delay = Math.min(60 * 60_000, 60_000 * 2 ** Math.min(event.attempts, 6));
      await db.update(billingWebhookEvents).set({ attempts: sql`${billingWebhookEvents.attempts} + 1`, nextAttemptAt: new Date(Date.now() + delay) })
        .where(and(eq(billingWebhookEvents.requestId, event.requestId), isNull(billingWebhookEvents.processedAt)));
      result.failed++;
    }
  }
  return result;
}
