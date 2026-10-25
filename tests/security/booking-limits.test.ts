import { beforeEach, describe, expect, it } from "vitest";
import {
  bookingByIpLimiter,
  bookingByPhoneLimiter,
  limitBooking,
  limitManage,
  limitPublicRead,
  resetRateLimitsForTests,
} from "@/server/security/limits";

beforeEach(() => resetRateLimitsForTests());

describe("limitBooking", () => {
  it("10 tentativas por IP em 10 min; a 11ª é recusada com o tempo de espera", () => {
    for (let i = 0; i < 10; i++) {
      expect(limitBooking("1.1.1.1", `5511900000${i.toString().padStart(3, "0")}`, 0).ok).toBe(true);
    }
    expect(limitBooking("1.1.1.1", "5511999999999", 60_000)).toEqual({
      ok: false,
      retryAfterSec: 9 * 60,
    });
    // outro IP não é afetado
    expect(limitBooking("2.2.2.2", "5511999999999", 60_000).ok).toBe(true);
    // passados 10 min o IP volta
    expect(limitBooking("1.1.1.1", "5511999999998", 10 * 60_000 + 1).ok).toBe(true);
  });

  it("5 tentativas por telefone em 1 h, de qualquer IP; a 6ª é recusada", () => {
    for (let i = 0; i < 5; i++) {
      expect(limitBooking(`10.0.0.${i}`, "5511988887777", 0).ok).toBe(true);
    }
    expect(limitBooking("10.0.0.9", "5511988887777", 1000)).toEqual({
      ok: false,
      retryAfterSec: 3600 - 1,
    });
    expect(limitBooking("10.0.0.9", "5511977776666", 1000).ok).toBe(true);
    expect(limitBooking("10.0.0.9", "5511988887777", 3600_000 + 1).ok).toBe(true);
  });

  it("IP bloqueado não cria chave por telefone", () => {
    for (let i = 0; i < 10; i++) limitBooking("1.1.1.1", `55119000000${i.toString().padStart(2, "0")}`, 0);
    const before = bookingByPhoneLimiter.size();
    for (let i = 0; i < 30; i++) {
      expect(limitBooking("1.1.1.1", `55118000000${i.toString().padStart(2, "0")}`, 1000).ok).toBe(false);
    }
    expect(bookingByPhoneLimiter.size()).toBe(before);
    expect(bookingByIpLimiter.size()).toBe(1);
  });
});

describe("limitPublicRead e limitManage", () => {
  it("consulta de horários: 120 por minuto por IP", () => {
    for (let i = 0; i < 120; i++) expect(limitPublicRead("1.1.1.1", 0).ok).toBe(true);
    expect(limitPublicRead("1.1.1.1", 1000).ok).toBe(false);
    expect(limitPublicRead("2.2.2.2", 1000).ok).toBe(true);
    expect(limitPublicRead("1.1.1.1", 60_001).ok).toBe(true);
  });

  it("remarcar e cancelar: 20 por 10 minutos por IP", () => {
    for (let i = 0; i < 20; i++) expect(limitManage("1.1.1.1", 0).ok).toBe(true);
    expect(limitManage("1.1.1.1", 1000).ok).toBe(false);
  });
});
