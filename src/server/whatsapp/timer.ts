/** Intervalo do relógio interno (a cada 5 minutos). */
export const WHATSAPP_TIMER_INTERVAL_MS = 5 * 60_000;
/** Espera depois de o servidor subir, para o banco e as migrações já estarem prontos. */
export const WHATSAPP_TIMER_FIRST_DELAY_MS = 60_000;

type Env = Record<string, string | undefined>;

/**
 * O relógio interno só liga em produção, com as credenciais da Meta
 * configuradas e sem o desligamento explícito (`WHATSAPP_INTERNAL_TIMER=off`).
 * Sem credenciais não há o que enviar; fora de produção os testes e o
 * desenvolvimento chamam o ciclo à mão.
 */
export function whatsappTimerEnabled(env: Env): boolean {
  if (env.NODE_ENV !== "production") return false;
  if (env.WHATSAPP_INTERNAL_TIMER === "off") return false;
  return Boolean(env.WHATSAPP_API_TOKEN && env.WHATSAPP_PHONE_NUMBER_ID);
}

type TimerGlobal = { __enevenWhatsAppTimer?: ReturnType<typeof setTimeout> | ReturnType<typeof setInterval> };

/**
 * Roda `task` a cada `intervalMs`, sem sobrepor duas execuções (se uma ainda
 * está rodando, a próxima rodada é pulada) e sem derrubar o servidor se ela
 * falhar. O relógio não segura o processo aberto e só existe um por processo.
 * Devolve uma função que o desliga (usada nos testes).
 */
export function startWhatsAppTimer(
  task: () => Promise<unknown>,
  {
    intervalMs = WHATSAPP_TIMER_INTERVAL_MS,
    firstDelayMs = WHATSAPP_TIMER_FIRST_DELAY_MS,
    log = console,
    registry = globalThis as TimerGlobal,
  }: {
    intervalMs?: number;
    firstDelayMs?: number;
    log?: Pick<Console, "error" | "info">;
    registry?: TimerGlobal;
  } = {},
): () => void {
  if (registry.__enevenWhatsAppTimer) return () => {};

  let running = false;
  const tick = async () => {
    if (running) return;
    running = true;
    try {
      await task();
    } catch (error) {
      log.error("Falha no ciclo do WhatsApp", error instanceof Error ? error.name : "erro desconhecido");
    } finally {
      running = false;
    }
  };

  let interval: ReturnType<typeof setInterval> | undefined;
  const first = setTimeout(() => {
    void tick();
    interval = setInterval(() => void tick(), intervalMs);
    interval.unref?.();
    registry.__enevenWhatsAppTimer = interval;
  }, firstDelayMs);
  first.unref?.();
  registry.__enevenWhatsAppTimer = first;
  log.info("Relógio do WhatsApp ligado (a cada 5 minutos).");

  return () => {
    clearTimeout(first);
    if (interval) clearInterval(interval);
    registry.__enevenWhatsAppTimer = undefined;
  };
}
