import { and, asc, eq, isNull, lte, or, sql } from "drizzle-orm";
import { billingWebhookEvents } from "@/db/schema";
import type { Db } from "@/db/types";
import { reconcilePayment } from "./reconcile-payment";

/** Processador de plataforma: eventos de outros tópicos aguardam implementação. */
export async function processPaymentEvents(db: Db, config: {
  accessToken: string; collectorId: string; liveMode: boolean; fetcher?: typeof fetch;
}, limit = 20): Promise<{ processed: number; failed: number }> {
  if (!config.accessToken || !config.collectorId || typeof config.liveMode !== "boolean") throw new Error("Configuração de cobrança incompleta.");
  const max = Number.isFinite(limit) ? Math.max(0, Math.min(100, Math.floor(limit))) : 0;
  if (!max) return { processed: 0, failed: 0 };
  const now = new Date();
  const events = await db.select().from(billingWebhookEvents)
    .where(and(eq(billingWebhookEvents.topic, "payment"), isNull(billingWebhookEvents.processedAt), or(isNull(billingWebhookEvents.nextAttemptAt), lte(billingWebhookEvents.nextAttemptAt, now))))
    .orderBy(asc(billingWebhookEvents.receivedAt), asc(billingWebhookEvents.requestId)).limit(max);
  const result = { processed: 0, failed: 0 };
  for (const event of events) {
    try {
      await reconcilePayment(db, event.resourceId, config);
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
