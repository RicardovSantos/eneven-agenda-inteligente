import { and, asc, eq, inArray, isNull, lte, or, sql } from "drizzle-orm";
import { billingCharges, billingInvoices, billingPaymentAttempts, billingSubscriptions, billingWebhookEvents } from "@/db/schema";
import type { Db } from "@/db/types";
import { reconcileCharge } from "./charges";
import { reconcilePayment } from "./reconcile-payment";
import { reconcileSubscription } from "./reconcile-subscription";
import { reconcileAuthorizedInvoice } from "./reconcile-invoice";
import { reconcileBillingAccess } from "./reconcile-access";
import { billingAccessEnabled } from "./mode";

/** Processa sinais; altera acesso só no modo real em produção ou no sandbox fora dela. */
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
      // Pix e boleto avulsos têm caminho próprio: não passam pela conciliação da assinatura de cartão.
      if (event.topic === "payment") {
        const [charge] = await db.select({ id: billingCharges.id }).from(billingCharges).where(eq(billingCharges.providerPaymentId, event.resourceId)).limit(1);
        if (charge) {
          await reconcileCharge(db, event.resourceId, config);
          const updated = await db.update(billingWebhookEvents).set({ processedAt: new Date() })
            .where(and(eq(billingWebhookEvents.requestId, event.requestId), isNull(billingWebhookEvents.processedAt)))
            .returning({ id: billingWebhookEvents.requestId });
          if (updated.length) result.processed++;
          continue;
        }
      }
      if (event.topic === "payment") await reconcilePayment(db, event.resourceId, config);
      else if (event.topic === "subscription_preapproval") await reconcileSubscription(db, event.resourceId, config);
      else {
        const { paymentId } = await reconcileAuthorizedInvoice(db, event.resourceId, config);
        if (paymentId) await reconcilePayment(db, paymentId, config);
      }
      if (billingAccessEnabled(config)) {
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
        if (!tenantId || await reconcileBillingAccess(db, tenantId) === "review") throw new Error("Acesso requer revisão.");
      }
      const updated = await db.update(billingWebhookEvents).set({ processedAt: new Date() })
        .where(and(eq(billingWebhookEvents.requestId, event.requestId), isNull(billingWebhookEvents.processedAt)))
        .returning({ id: billingWebhookEvents.requestId });
      if (updated.length) result.processed++;
    } catch (error) {
      // Permanece pendente para revisão e nova tentativa. Só o tipo, o identificador e a mensagem
      // vão para o log (nenhum conteúdo do aviso), para dar para saber por que ficou travado.
      console.warn(`Aviso da cobrança não processado (${event.topic} ${event.resourceId}, tentativa ${event.attempts + 1}): ${error instanceof Error ? error.message : "erro"}`);
      const delay = Math.min(60 * 60_000, 60_000 * 2 ** Math.min(event.attempts, 6));
      await db.update(billingWebhookEvents).set({ attempts: sql`${billingWebhookEvents.attempts} + 1`, nextAttemptAt: new Date(Date.now() + delay) })
        .where(and(eq(billingWebhookEvents.requestId, event.requestId), isNull(billingWebhookEvents.processedAt)));
      result.failed++;
    }
  }
  return result;
}
