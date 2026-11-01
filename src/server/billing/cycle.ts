import type { Db } from "@/db/types";
import { applyCancelledExpiry } from "./cancel-expiry";
import { billingAccessEnabled, billingConfig } from "./mode";
import { sendOwnerBillingNotice } from "./owner-notice";
import { processPaymentEvents } from "./process-events";
import { reconcileDueBillingAccess } from "./reconcile-due-access";
import { processBillingNotices } from "./test-notices";

/**
 * Um ciclo da cobrança real: processa os avisos recebidos da Mercado Pago, concilia os
 * vencimentos, encerra o acesso de assinaturas canceladas cujo período acabou e avisa
 * os donos em atraso. Só roda no modo real; o sandbox continua pelo cron manual.
 */
export async function runBillingCycle(db: Db, now = new Date()) {
  const config = billingConfig();
  if (!config?.live) return null;
  const access = { accessToken: config.accessToken, collectorId: config.collectorId, liveMode: true };
  const events = await processPaymentEvents(db, access);
  const due = billingAccessEnabled(access) ? await reconcileDueBillingAccess(db, access, now) : null;
  const cancelled = await applyCancelledExpiry(db, now);
  const notices = await processBillingNotices(db, (tenantId) => sendOwnerBillingNotice(db, tenantId), { now, requireUnpaidInvoice: true });
  return { events, due, cancelled, notices };
}
