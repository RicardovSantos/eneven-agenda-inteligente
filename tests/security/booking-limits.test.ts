import { beforeEach, describe, expect, it } from "vitest";
import {
  bookingByIpLimiter,
  bookingByPhoneLimiter,
  limitBookingIp,
  limitBookingPhone,
  limitManage,
  limitPublicRead,
  resetRateLimitsForTests,
} from "@/server/security/limits";

beforeEach(() => resetRateLimitsForTests());

describe("limitBookingIp e limitBookingPhone", () => {
  it("10 tentativas por IP em 10 min; a 11ª é recusada com o tempo de espera", () => {
    for (let i = 0; i < 10; i++) expect(limitBookingIp("1.1.1.1", 0).ok).toBe(true);
    expect(limitBookingIp("1.1.1.1", 60_000)).toEqual({ ok: false, retryAfterSec: 9 * 60 });
    // outro IP não é afetado
    expect(limitBookingIp("2.2.2.2", 60_000).ok).toBe(true);
    // passados 10 min o IP volta
    expect(limitBookingIp("1.1.1.1", 10 * 60_000 + 1).ok).toBe(true);
    expect(bookingByIpLimiter.size()).toBe(2);
  });

  it("5 tentativas por telefone em 1 h; a 6ª é recusada", () => {
    for (let i = 0; i < 5; i++) expect(limitBookingPhone("5511988887777", 0).ok).toBe(true);
    expect(limitBookingPhone("5511988887777", 1000)).toEqual({ ok: false, retryAfterSec: 3600 - 1 });
    expect(limitBookingPhone("5511977776666", 1000).ok).toBe(true);
    expect(limitBookingPhone("5511988887777", 3600_000 + 1).ok).toBe(true);
    expect(bookingByPhoneLimiter.size()).toBe(2);
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
