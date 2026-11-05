/**
 * Roda uma vez quando o servidor sobe. Liga os relógios internos (WhatsApp e cobrança);
 * o serviço roda com uma só réplica, então um relógio por processo basta.
 * Os imports ficam dentro do `if` para não entrarem no bundle do edge.
 */
export async function register() {
  if (process.env.NEXT_RUNTIME !== "nodejs") return;

  const { whatsappTimerEnabled, startWhatsAppTimer } = await import("@/server/whatsapp/timer");
  if (whatsappTimerEnabled(process.env)) {
    const { getDb } = await import("@/db/client");
    const { runWhatsAppCycle } = await import("@/server/whatsapp/cycle");
    startWhatsAppTimer(async () => {
      const result = await runWhatsAppCycle(await getDb());
      if (result.scheduled > 0 || result.processed > 0) {
        console.info("Ciclo do WhatsApp:", JSON.stringify(result));
      }
    });
  }

  const { anyLiveBillingEnabled } = await import("@/server/billing/mode");
  if (anyLiveBillingEnabled(process.env)) {
    const { getDb } = await import("@/db/client");
    const { runBillingCycle } = await import("@/server/billing/cycle");
    const { startWhatsAppTimer: startTimer } = await import("@/server/whatsapp/timer");
    // Mesmo relógio (sem sobreposição, um por processo), em intervalo próprio de 10 minutos.
    startTimer(
      async () => {
        const result = await runBillingCycle(await getDb());
        if (result && (result.events.processed || result.events.failed || result.cancelled.expired || result.notices.sent || result.notices.uncertain || result.trial.sent || result.trial.uncertain || result.plans.applied || result.plans.canceled || result.plans.failed)) {
          console.info("Ciclo da cobrança:", JSON.stringify({ events: result.events, cancelled: result.cancelled, notices: result.notices, trial: result.trial, plans: result.plans }));
        }
      },
      { intervalMs: 10 * 60_000, firstDelayMs: 90_000, registry: namedRegistry("__enevenBillingTimerRegistry"), log: console },
    );
  }

  const { livePushEnabled, pushVapid } = await import("@/server/push/mode");
  const vapid = pushVapid(process.env);
  if (vapid && livePushEnabled(process.env)) {
    const { getDb } = await import("@/db/client");
    const { processTestPushQueue, testPushSender } = await import("@/server/push/process-test-queue");
    const { startWhatsAppTimer: startTimer } = await import("@/server/whatsapp/timer");
    // Os avisos expiram em 5 minutos, então a fila roda a cada 30 segundos.
    startTimer(
      async () => {
        const result = await processTestPushQueue(await getDb(), testPushSender(vapid));
        if (result.sent || result.uncertain || result.expired) console.info("Fila de notificações:", JSON.stringify(result));
      },
      { intervalMs: 30_000, firstDelayMs: 45_000, registry: namedRegistry("__enevenPushTimerRegistry"), log: console },
    );
  }
}

/** Registro separado por relógio, para todos poderem existir no mesmo processo. */
type TimerRegistry = { __enevenWhatsAppTimer?: ReturnType<typeof setTimeout> | ReturnType<typeof setInterval> };
function namedRegistry(name: string): TimerRegistry {
  const holder = globalThis as unknown as Record<string, TimerRegistry | undefined>;
  holder[name] ??= {};
  return holder[name]!;
}
