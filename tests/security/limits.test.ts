import { beforeEach, describe, expect, it } from "vitest";
import {
  forgotPasswordByEmailLimiter,
  forgotPasswordByIpLimiter,
  limitForgotPassword,
  limitLogin,
  loginByIpAndEmailLimiter,
  loginByIpLimiter,
  resetRateLimitsForTests,
} from "@/server/security/limits";

beforeEach(() => resetRateLimitsForTests());

describe("limitLogin", () => {
  it("IP bloqueado: não gasta nem cria chave por IP + e-mail", () => {
    for (let i = 0; i < 30; i++) expect(limitLogin("1.1.1.1", `p${i}@x.com`, 0).ok).toBe(true);
    const before = loginByIpAndEmailLimiter.size();

    for (let i = 0; i < 50; i++) {
      expect(limitLogin("1.1.1.1", `novo${i}@x.com`, 1000).ok).toBe(false);
    }
    expect(loginByIpAndEmailLimiter.size()).toBe(before);
  });

  it("IP liberado e e-mail estourado: bloqueia", () => {
    for (let i = 0; i < 10; i++) limitLogin("1.1.1.1", "ana@x.com", 0);
    expect(limitLogin("1.1.1.1", "ana@x.com", 1).ok).toBe(false);
    expect(limitLogin("1.1.1.1", "outra@x.com", 1).ok).toBe(true);
  });

  it("o tempo de espera é o do limite que recusou", () => {
    for (let i = 0; i < 30; i++) limitLogin("1.1.1.1", `p${i}@x.com`, 0);
    const result = limitLogin("1.1.1.1", "ana@x.com", 60_000);
    expect(result).toEqual({ ok: false, retryAfterSec: 14 * 60 });
  });

  it("chaves por IP + e-mail têm limite duro de 10 000", () => {
    for (let i = 0; i < 10_100; i++) loginByIpAndEmailLimiter.hit(`ip${i}|a@x.com`, 0);
    expect(loginByIpAndEmailLimiter.size()).toBe(10_000);
    for (let i = 0; i < 10_100; i++) loginByIpLimiter.hit(`ip${i}`, 0);
    expect(loginByIpLimiter.size()).toBe(10_000);
  });
});

describe("limitForgotPassword", () => {
  it("IP bloqueado: não cria chave por e-mail", () => {
    for (let i = 0; i < 5; i++) expect(limitForgotPassword("1.1.1.1", `p${i}@x.com`, 0).ok).toBe(true);
    const before = forgotPasswordByEmailLimiter.size();

    for (let i = 0; i < 50; i++) {
      expect(limitForgotPassword("1.1.1.1", `novo${i}@x.com`, 1000).ok).toBe(false);
    }
    expect(forgotPasswordByEmailLimiter.size()).toBe(before);
  });

  it("e-mail estourado vindo de IPs diferentes: bloqueia", () => {
    for (let i = 0; i < 5; i++) limitForgotPassword(`2.2.2.${i}`, "ana@x.com", 0);
    expect(limitForgotPassword("2.2.2.99", "ana@x.com", 1).ok).toBe(false);
  });

  it("chaves por e-mail têm limite duro de 10 000", () => {
    for (let i = 0; i < 10_100; i++) forgotPasswordByEmailLimiter.hit(`e${i}@x.com`, 0);
    expect(forgotPasswordByEmailLimiter.size()).toBe(10_000);
    for (let i = 0; i < 10_100; i++) forgotPasswordByIpLimiter.hit(`ip${i}`, 0);
    expect(forgotPasswordByIpLimiter.size()).toBe(10_000);
  });
});
