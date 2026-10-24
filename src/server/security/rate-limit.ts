export type RateLimitResult = { ok: true } | { ok: false; retryAfterSec: number };

export type RateLimiter = {
  /** Conta uma tentativa para `key`. `now` (ms) existe para os testes. */
  hit(key: string, now?: number): RateLimitResult;
  /** Esquece todas as chaves (testes). */
  reset(): void;
  /** Quantas chaves estão guardadas (testes). */
  size(): number;
};

type Window = { count: number; resetAt: number };

/**
 * Limitador de janela fixa, em memória. A aplicação roda num processo só
 * (Easypanel), então não precisa de Redis; reiniciar o processo zera as
 * contagens, o que é aceitável para proteção contra tentativa em massa.
 *
 * A janela abre na primeira tentativa da chave e vale `windowMs`. Passado o
 * `limit`, as tentativas são recusadas até a janela vencer (as recusadas não
 * estendem a janela). Chaves vencidas são varridas, no máximo uma vez por
 * janela, para o mapa não crescer sem limite.
 */
export function createRateLimiter(options: { limit: number; windowMs: number }): RateLimiter {
  const { limit, windowMs } = options;
  const windows = new Map<string, Window>();
  let lastSweep = Number.NEGATIVE_INFINITY;

  function sweep(now: number) {
    if (now - lastSweep < windowMs) return;
    lastSweep = now;
    for (const [key, window] of windows) {
      if (window.resetAt <= now) windows.delete(key);
    }
  }

  return {
    hit(key, now = Date.now()) {
      sweep(now);
      const current = windows.get(key);
      if (!current || current.resetAt <= now) {
        windows.set(key, { count: 1, resetAt: now + windowMs });
        return { ok: true };
      }
      if (current.count >= limit) {
        return { ok: false, retryAfterSec: Math.max(1, Math.ceil((current.resetAt - now) / 1000)) };
      }
      current.count += 1;
      return { ok: true };
    },
    reset() {
      windows.clear();
      lastSweep = Number.NEGATIVE_INFINITY;
    },
    size: () => windows.size,
  };
}

/**
 * IP do cliente pelo primeiro item de `x-forwarded-for` (o proxy do Easypanel
 * define o cabeçalho). Sem cabeçalho devolve `"unknown"`, que vira uma chave
 * única compartilhada (mais restritiva, nunca mais frouxa).
 */
export function getClientIp(headers: { get(name: string): string | null }): string {
  const first = headers.get("x-forwarded-for")?.split(",")[0]?.trim();
  return first || "unknown";
}

/** "Muitas tentativas. Tente de novo em N minutos." (N arredondado para cima, mínimo 1). */
export function rateLimitMessage(retryAfterSec: number): string {
  const minutes = Math.max(1, Math.ceil(retryAfterSec / 60));
  return `Muitas tentativas. Tente de novo em ${minutes} ${minutes === 1 ? "minuto" : "minutos"}.`;
}
