import type { Db } from "@/db/types";
import { applyCancelledExpiry } from "./cancel-expiry";
import { applyScheduledPlanChanges } from "./change-plan";
import { billingAccessEnabled, billingConfig } from "./mode";
import { getStripe } from "./stripe/client";
import { stripeConfig, stripeLiveEnabled } from "./stripe/config";
import { processStripeEvents } from "./stripe/events";
import { runChargeCycle } from "./charge-cycle";
import { sendChargeOverdueNotice, sendOwnerBillingNotice, sendRenewalNotice, sendTrialNotice } from "./owner-notice";
import { processPaymentEvents } from "./process-events";
import { reconcileDueBillingAccess } from "./reconcile-due-access";
import { refreshPendingStripeSubscriptions, refreshPendingSubscriptions } from "./refresh-pending";
import { processBillingNotices } from "./test-notices";
import { processTrialNotices } from "./trial-notices";

/**
 * Um ciclo da cobrança real: processa os avisos recebidos da Mercado Pago, concilia os
 * vencimentos, encerra o acesso de assinaturas canceladas cujo período acabou e avisa
 * os donos em atraso e os donos cujo teste grátis está acabando. Só roda no modo real; o sandbox continua pelo cron manual.
 */
export async function runBillingCycle(db: Db, now = new Date()) {
  const config = billingConfig();
  const mercadoPago = config?.live ? config : null;
  const stripeSettings = stripeConfig();
  const stripeLive = stripeSettings && stripeLiveEnabled() ? stripeSettings : null;
  // Cada provedor cuida só do que é dele; o resto (acesso, avisos, vencimento) vale para os dois.
  if (!mercadoPago && !stripeLive) return null;
  const access = mercadoPago ? { accessToken: mercadoPago.accessToken, collectorId: mercadoPago.collectorId, liveMode: true } : null;
  // Antes dos avisos: uma assinatura cancelada pela Mercado Pago (pagamento recusado) deixa de
  // travar os avisos do pagamento, que sem isso ficam pedindo revisão para sempre.
  const pending = access ? await refreshPendingSubscriptions(db, access, { now }) : { updated: 0, unchanged: 0, failed: 0 };
  const mpEvents = access ? await processPaymentEvents(db, access) : { processed: 0, failed: 0 };
  let stripeEvents = { processed: 0, failed: 0 };
  if (stripeLive) {
    const stripe = getStripe(stripeLive);
    await refreshPendingStripeSubscriptions(db, stripe, { now });
    stripeEvents = await processStripeEvents(db, stripe, stripeLive);
  }
  const events = { processed: mpEvents.processed + stripeEvents.processed, failed: mpEvents.failed + stripeEvents.failed };
  const due = access && billingAccessEnabled(access) ? await reconcileDueBillingAccess(db, access, now) : null;
  const cancelled = await applyCancelledExpiry(db, now);
  const notices = await processBillingNotices(db, (tenantId) => sendOwnerBillingNotice(db, tenantId), { now, requireUnpaidInvoice: true });
  const plans = await applyScheduledPlanChanges(db, mercadoPago, now);
  const trial = await processTrialNotices(db, (tenantId, kind, endsAt) => sendTrialNotice(db, tenantId, kind, endsAt), { now });
  const charges = await runChargeCycle(db, {
    renewal: (tenantId, periodEnd) => sendRenewalNotice(db, tenantId, periodEnd),
    overdue: (tenantId) => sendChargeOverdueNotice(db, tenantId),
  }, now);
  return { pending, events, due, cancelled, notices, trial, plans, charges };
}
