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

  const { liveBillingEnabled } = await import("@/server/billing/mode");
  if (liveBillingEnabled(process.env)) {
    const { getDb } = await import("@/db/client");
    const { runBillingCycle } = await import("@/server/billing/cycle");
    const { startWhatsAppTimer: startTimer } = await import("@/server/whatsapp/timer");
    // Mesmo relógio (sem sobreposição, um por processo), em intervalo próprio de 10 minutos.
    startTimer(
      async () => {
        const result = await runBillingCycle(await getDb());
        if (result && (result.events.processed || result.events.failed || result.cancelled.expired || result.notices.sent || result.notices.uncertain)) {
          console.info("Ciclo da cobrança:", JSON.stringify({ events: result.events, cancelled: result.cancelled, notices: result.notices }));
        }
      },
      { intervalMs: 10 * 60_000, firstDelayMs: 90_000, registry: billingRegistry(), log: console },
    );
  }
}

/** Registro separado do relógio do WhatsApp, para os dois poderem existir no mesmo processo. */
function billingRegistry() {
  const holder = globalThis as { __enevenBillingTimerRegistry?: { __enevenWhatsAppTimer?: ReturnType<typeof setTimeout> | ReturnType<typeof setInterval> } };
  holder.__enevenBillingTimerRegistry ??= {};
  return holder.__enevenBillingTimerRegistry;
}
