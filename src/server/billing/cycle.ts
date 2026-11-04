import type { Db } from "@/db/types";
import { applyCancelledExpiry } from "./cancel-expiry";
import { applyScheduledPlanChanges } from "./change-plan";
import { billingAccessEnabled, billingConfig } from "./mode";
import { runChargeCycle } from "./charge-cycle";
import { sendChargeOverdueNotice, sendOwnerBillingNotice, sendRenewalNotice, sendTrialNotice } from "./owner-notice";
import { processPaymentEvents } from "./process-events";
import { reconcileDueBillingAccess } from "./reconcile-due-access";
import { refreshPendingSubscriptions } from "./refresh-pending";
import { processBillingNotices } from "./test-notices";
import { processTrialNotices } from "./trial-notices";

/**
 * Um ciclo da cobrança real: processa os avisos recebidos da Mercado Pago, concilia os
 * vencimentos, encerra o acesso de assinaturas canceladas cujo período acabou e avisa
 * os donos em atraso e os donos cujo teste grátis está acabando. Só roda no modo real; o sandbox continua pelo cron manual.
 */
export async function runBillingCycle(db: Db, now = new Date()) {
  const config = billingConfig();
  if (!config?.live) return null;
  const access = { accessToken: config.accessToken, collectorId: config.collectorId, liveMode: true };
  // Antes dos avisos: uma assinatura cancelada pela Mercado Pago (pagamento recusado) deixa de
  // travar os avisos do pagamento, que sem isso ficam pedindo revisão para sempre.
  const pending = await refreshPendingSubscriptions(db, access, { now });
  const events = await processPaymentEvents(db, access);
  const due = billingAccessEnabled(access) ? await reconcileDueBillingAccess(db, access, now) : null;
  const cancelled = await applyCancelledExpiry(db, now);
  const notices = await processBillingNotices(db, (tenantId) => sendOwnerBillingNotice(db, tenantId), { now, requireUnpaidInvoice: true });
  const plans = await applyScheduledPlanChanges(db, config, now);
  const trial = await processTrialNotices(db, (tenantId, kind, endsAt) => sendTrialNotice(db, tenantId, kind, endsAt), { now });
  const charges = await runChargeCycle(db, {
    renewal: (tenantId, periodEnd) => sendRenewalNotice(db, tenantId, periodEnd),
    overdue: (tenantId) => sendChargeOverdueNotice(db, tenantId),
  }, now);
  return { pending, events, due, cancelled, notices, trial, plans, charges };
}
