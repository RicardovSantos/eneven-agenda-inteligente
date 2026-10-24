import { afterEach, describe, expect, it, vi } from "vitest";
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

  it("limite duro de chaves: passou do máximo, descarta as mais antigas", () => {
    const limiter = createRateLimiter({ limit: 1, windowMs: 60 * MIN, maxKeys: 100 });
    for (let i = 0; i < 100; i++) limiter.hit(`k${i}`, i);
    expect(limiter.size()).toBe(100);

    limiter.hit("novo", 1000);
    expect(limiter.size()).toBe(100);
    // k0 (a mais antiga) foi descartada: volta a ser aceita; k99 continua contada.
    expect(limiter.hit("k0", 1001).ok).toBe(true);
    expect(limiter.hit("k99", 1002).ok).toBe(false);
  });

  it("o limite padrão é de 10 000 chaves", () => {
    const limiter = createRateLimiter({ limit: 1, windowMs: 60 * MIN });
    for (let i = 0; i < 10_050; i++) limiter.hit(`k${i}`, 0);
    expect(limiter.size()).toBe(10_000);
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
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.restoreAllMocks();
  });

  it("usa o ÚLTIMO item de x-forwarded-for (o que o Traefik viu na conexão)", () => {
    const headers = new Headers({ "x-forwarded-for": " 10.0.0.1 , 203.0.113.9 " });
    expect(getClientIp(headers)).toBe("203.0.113.9");
    expect(getClientIp(new Headers({ "x-forwarded-for": "203.0.113.9" }))).toBe("203.0.113.9");
  });

  it("um primeiro item forjado pelo cliente não muda a chave", () => {
    const real = "203.0.113.9";
    const a = getClientIp(new Headers({ "x-forwarded-for": real }));
    const b = getClientIp(new Headers({ "x-forwarded-for": `1.2.3.4, ${real}` }));
    const c = getClientIp(new Headers({ "x-forwarded-for": `9.9.9.9, 8.8.8.8, ${real}` }));
    expect(b).toBe(a);
    expect(c).toBe(a);
  });

  it("ignora itens vazios no fim", () => {
    expect(getClientIp(new Headers({ "x-forwarded-for": "10.0.0.1, 203.0.113.9, , " }))).toBe(
      "203.0.113.9",
    );
  });

  it("sem o cabeçalho (ou vazio) devolve unknown", () => {
    expect(getClientIp(new Headers())).toBe("unknown");
    expect(getClientIp(new Headers({ "x-forwarded-for": "  " }))).toBe("unknown");
    expect(getClientIp(new Headers({ "x-forwarded-for": " , " }))).toBe("unknown");
  });

  it("em produção, cabeçalho ausente gera um aviso (uma vez só); fora dela, nenhum", async () => {
    vi.resetModules();
    const { getClientIp: fresh } = await import("@/server/security/rate-limit");
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});

    fresh(new Headers());
    expect(warn).not.toHaveBeenCalled();

    vi.stubEnv("NODE_ENV", "production");
    fresh(new Headers());
    fresh(new Headers());
    expect(warn).toHaveBeenCalledTimes(1);
    expect(String(warn.mock.calls[0][0])).toContain("x-forwarded-for");

    warn.mockClear();
    fresh(new Headers({ "x-forwarded-for": "203.0.113.9" }));
    expect(warn).not.toHaveBeenCalled();
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
