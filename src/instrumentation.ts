/**
 * Roda uma vez quando o servidor sobe. Liga o relógio interno do WhatsApp (o
 * serviço roda com uma só réplica, então um relógio por processo basta).
 * Os imports ficam dentro do `if` para não entrarem no bundle do edge.
 */
export async function register() {
  if (process.env.NEXT_RUNTIME !== "nodejs") return;

  const { whatsappTimerEnabled, startWhatsAppTimer } = await import("@/server/whatsapp/timer");
  if (!whatsappTimerEnabled(process.env)) return;

  const { getDb } = await import("@/db/client");
  const { runWhatsAppCycle } = await import("@/server/whatsapp/cycle");
  startWhatsAppTimer(async () => {
    const result = await runWhatsAppCycle(await getDb());
    if (result.scheduled > 0 || result.processed > 0) {
      console.info("Ciclo do WhatsApp:", JSON.stringify(result));
    }
  });
}
