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

const DEFAULT_MAX_KEYS = 10_000;

/**
 * Limitador de janela fixa, em memória. A aplicação roda num processo só
 * (Easypanel), então não precisa de Redis; reiniciar o processo zera as
 * contagens, o que é aceitável para proteção contra tentativa em massa.
 *
 * A janela abre na primeira tentativa da chave e vale `windowMs`. Passado o
 * `limit`, as tentativas são recusadas até a janela vencer (as recusadas não
 * estendem a janela). Chaves vencidas são varridas, no máximo uma vez por
 * janela, e há um teto de `maxKeys` chaves (padrão 10 000): passou dele, as
 * mais antigas (ordem de inserção do Map) são descartadas. Assim um atacante
 * que inventa chaves não faz a memória crescer sem limite.
 */
export function createRateLimiter(options: {
  limit: number;
  windowMs: number;
  maxKeys?: number;
}): RateLimiter {
  const { limit, windowMs, maxKeys = DEFAULT_MAX_KEYS } = options;
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
        // Reinserir (apagar e gravar) mantém a ordem do Map = ordem de abertura da janela.
        windows.delete(key);
        while (windows.size >= maxKeys) {
          const oldest = windows.keys().next();
          if (oldest.done) break;
          windows.delete(oldest.value);
        }
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

let warnedAboutMissingForwardedFor = false;

/**
 * IP do cliente pelo ÚLTIMO item (não vazio) de `x-forwarded-for`: é o
 * endereço que o Traefik do Easypanel viu na conexão TCP. Os itens anteriores
 * podem ter sido enviados pelo próprio cliente (forjados), então não valem
 * como chave de limite. Não usa `x-real-ip`. Se o proxy da Cloudflare
 * (nuvem laranja) for ligado, trocar por `CF-Connecting-IP` e configurar o
 * `trustedIPs` do Traefik com as faixas da Cloudflare (ver README).
 *
 * Sem cabeçalho devolve `"unknown"`, uma chave única compartilhada (mais
 * restritiva, nunca mais frouxa); em produção avisa uma vez no log, porque
 * indica proxy mal configurado.
 */
export function getClientIp(headers: { get(name: string): string | null }): string {
  const entries = (headers.get("x-forwarded-for") ?? "")
    .split(",")
    .map((entry) => entry.trim())
    .filter(Boolean);
  const last = entries.at(-1);
  if (last) return last;

  if (process.env.NODE_ENV === "production" && !warnedAboutMissingForwardedFor) {
    warnedAboutMissingForwardedFor = true;
    console.warn(
      "x-forwarded-for ausente: todos os pedidos contam como o mesmo IP no limite de tentativas. Confira o proxy.",
    );
  }
  return "unknown";
}

/** "Muitas tentativas. Tente de novo em N minutos." (N arredondado para cima, mínimo 1). */
export function rateLimitMessage(retryAfterSec: number): string {
  const minutes = Math.max(1, Math.ceil(retryAfterSec / 60));
  return `Muitas tentativas. Tente de novo em ${minutes} ${minutes === 1 ? "minuto" : "minutos"}.`;
}
