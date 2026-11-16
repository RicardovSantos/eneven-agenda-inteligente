/**
 * Mantém as notificações vivas neste aparelho. O serviço de notificações (Apple, Google) pode
 * recusar uma inscrição antiga; o servidor então a marca como "parada". Ao abrir o painel,
 * se este aparelho está marcado, ele cria uma inscrição nova sozinho. Só renova quem JÁ tinha
 * cadastrado e continua com a permissão: quem removeu o aparelho da lista não é recadastrado.
 */
export type HealResult = "skipped" | "ok" | "renewed" | "needs-tap";

export type HealDeps = {
  /** Situação da permissão do navegador, ou `unsupported` sem suporte a notificações. */
  permission: () => NotificationPermission | "unsupported";
  /** Inscrição atual deste aparelho (ou `null` se nunca cadastrou). */
  current: () => Promise<PushSubscriptionJSON | null>;
  /** O que o servidor sabe sobre esta inscrição. */
  status: (subscription: PushSubscriptionJSON) => Promise<"ok" | "stale" | "unknown">;
  /** Cria a inscrição nova e a salva. Pode falhar fora de um toque do usuário (iOS). */
  renew: () => Promise<unknown>;
};

export async function healPushDevice(deps: HealDeps): Promise<HealResult> {
  if (deps.permission() !== "granted") return "skipped";
  let subscription: PushSubscriptionJSON | null;
  try {
    subscription = await deps.current();
  } catch {
    return "skipped";
  }
  if (!subscription) return "skipped";
  let state: "ok" | "stale" | "unknown";
  try {
    state = await deps.status(subscription);
  } catch {
    return "skipped"; // sem rede ou sessão vencida: tenta de novo na próxima abertura
  }
  if (state !== "stale") return "ok";
  try {
    await deps.renew();
    return "renewed";
  } catch {
    return "needs-tap";
  }
}
