import { describe, expect, it } from "vitest";
import {
  createRateLimiter,
  getClientIp,
  rateLimitMessage,
} from "@/server/security/rate-limit";

const MIN = 60_000;

describe("createRateLimiter", () => {
  it("aceita até o limite e recusa a tentativa seguinte, com o tempo restante", () => {
    const limiter = createRateLimiter({ limit: 3, windowMs: 15 * MIN });
    const t0 = 1_000_000;
    expect(limiter.hit("a", t0)).toEqual({ ok: true });
    expect(limiter.hit("a", t0 + 1000)).toEqual({ ok: true });
    expect(limiter.hit("a", t0 + 2000)).toEqual({ ok: true });

    const blocked = limiter.hit("a", t0 + 60_000);
    // A janela abriu em t0 e vence em t0 + 15 min: restam 14 min.
    expect(blocked).toEqual({ ok: false, retryAfterSec: 14 * 60 });
  });

  it("chaves diferentes não se misturam", () => {
    const limiter = createRateLimiter({ limit: 1, windowMs: MIN });
    expect(limiter.hit("a", 0).ok).toBe(true);
    expect(limiter.hit("b", 0).ok).toBe(true);
    expect(limiter.hit("a", 1).ok).toBe(false);
    expect(limiter.hit("b", 1).ok).toBe(false);
  });

  it("depois que a janela vence, volta a aceitar", () => {
    const limiter = createRateLimiter({ limit: 2, windowMs: MIN });
    limiter.hit("a", 0);
    limiter.hit("a", 10);
    expect(limiter.hit("a", MIN - 1).ok).toBe(false);
    expect(limiter.hit("a", MIN)).toEqual({ ok: true });
    expect(limiter.hit("a", MIN + 1)).toEqual({ ok: true });
    expect(limiter.hit("a", MIN + 2).ok).toBe(false);
  });

  it("tentativa recusada não estende a janela", () => {
    const limiter = createRateLimiter({ limit: 1, windowMs: MIN });
    limiter.hit("a", 0);
    for (let t = 1; t < 50; t++) limiter.hit("a", t * 1000);
    expect(limiter.hit("a", MIN).ok).toBe(true);
  });

  it("retryAfterSec arredonda para cima (mínimo 1)", () => {
    const limiter = createRateLimiter({ limit: 1, windowMs: MIN });
    limiter.hit("a", 0);
    expect(limiter.hit("a", MIN - 1)).toEqual({ ok: false, retryAfterSec: 1 });
    expect(limiter.hit("a", 400)).toEqual({ ok: false, retryAfterSec: 60 });
  });

  it("reset() esquece tudo", () => {
    const limiter = createRateLimiter({ limit: 1, windowMs: MIN });
    limiter.hit("a", 0);
    limiter.reset();
    expect(limiter.hit("a", 1).ok).toBe(true);
  });

  it("não acumula chaves vencidas na memória", () => {
    const limiter = createRateLimiter({ limit: 1, windowMs: MIN });
    for (let i = 0; i < 5000; i++) limiter.hit(`k${i}`, 0);
    expect(limiter.size()).toBe(5000);
    limiter.hit("novo", 10 * MIN);
    expect(limiter.size()).toBeLessThan(5000);
  });
});

describe("getClientIp", () => {
  it("usa o primeiro item de x-forwarded-for", () => {
    const headers = new Headers({ "x-forwarded-for": " 203.0.113.9 , 10.0.0.1" });
    expect(getClientIp(headers)).toBe("203.0.113.9");
  });

  it("sem o cabeçalho (ou vazio) devolve unknown", () => {
    expect(getClientIp(new Headers())).toBe("unknown");
    expect(getClientIp(new Headers({ "x-forwarded-for": "  " }))).toBe("unknown");
  });
});

describe("rateLimitMessage", () => {
  it("arredonda os minutos para cima, no mínimo 1", () => {
    expect(rateLimitMessage(1)).toBe("Muitas tentativas. Tente de novo em 1 minuto.");
    expect(rateLimitMessage(60)).toBe("Muitas tentativas. Tente de novo em 1 minuto.");
    expect(rateLimitMessage(61)).toBe("Muitas tentativas. Tente de novo em 2 minutos.");
    expect(rateLimitMessage(14 * 60)).toBe("Muitas tentativas. Tente de novo em 14 minutos.");
  });
});
