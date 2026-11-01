import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { startWhatsAppTimer, whatsappTimerEnabled } from "@/server/whatsapp/timer";

const log = { error: vi.fn(), info: vi.fn() };

beforeEach(() => {
  vi.useFakeTimers();
  log.error.mockClear();
  log.info.mockClear();
});
afterEach(() => vi.useRealTimers());

describe("whatsappTimerEnabled", () => {
  const ok = { NODE_ENV: "production", WHATSAPP_API_TOKEN: "t", WHATSAPP_PHONE_NUMBER_ID: "1" };

  it("liga só em produção com as duas credenciais da Meta", () => {
    expect(whatsappTimerEnabled(ok)).toBe(true);
    expect(whatsappTimerEnabled({ ...ok, NODE_ENV: "development" })).toBe(false);
    expect(whatsappTimerEnabled({ ...ok, NODE_ENV: "test" })).toBe(false);
    expect(whatsappTimerEnabled({ ...ok, WHATSAPP_API_TOKEN: "" })).toBe(false);
    expect(whatsappTimerEnabled({ ...ok, WHATSAPP_PHONE_NUMBER_ID: undefined })).toBe(false);
  });

  it("pode ser desligado de propósito", () => {
    expect(whatsappTimerEnabled({ ...ok, WHATSAPP_INTERNAL_TIMER: "off" })).toBe(false);
  });
});

describe("startWhatsAppTimer", () => {
  it("espera o primeiro atraso e depois roda a cada intervalo", async () => {
    const task = vi.fn().mockResolvedValue(undefined);
    const stop = startWhatsAppTimer(task, { intervalMs: 1000, firstDelayMs: 500, log, registry: {} });
    await vi.advanceTimersByTimeAsync(499);
    expect(task).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(1);
    expect(task).toHaveBeenCalledTimes(1);
    await vi.advanceTimersByTimeAsync(2000);
    expect(task).toHaveBeenCalledTimes(3);
    stop();
    await vi.advanceTimersByTimeAsync(5000);
    expect(task).toHaveBeenCalledTimes(3);
  });

  it("não sobrepõe: se a rodada anterior ainda roda, pula a seguinte", async () => {
    let release!: () => void;
    const task = vi.fn(() => new Promise<void>((resolve) => (release = resolve)));
    const stop = startWhatsAppTimer(task, { intervalMs: 1000, firstDelayMs: 0, log, registry: {} });
    await vi.advanceTimersByTimeAsync(3500);
    expect(task).toHaveBeenCalledTimes(1);
    release();
    await vi.advanceTimersByTimeAsync(1000);
    expect(task).toHaveBeenCalledTimes(2);
    stop();
  });

  it("uma falha é registrada sem dados sensíveis e o relógio continua", async () => {
    const task = vi
      .fn()
      .mockRejectedValueOnce(new Error("segredo-no-texto"))
      .mockResolvedValue(undefined);
    const stop = startWhatsAppTimer(task, { intervalMs: 1000, firstDelayMs: 0, log, registry: {} });
    await vi.advanceTimersByTimeAsync(2500);
    expect(task).toHaveBeenCalledTimes(3);
    expect(log.error).toHaveBeenCalledTimes(1);
    expect(JSON.stringify(log.error.mock.calls)).not.toContain("segredo-no-texto");
    stop();
  });

  it("só existe um relógio por processo", async () => {
    const registry = {};
    const a = vi.fn().mockResolvedValue(undefined);
    const b = vi.fn().mockResolvedValue(undefined);
    const stop = startWhatsAppTimer(a, { intervalMs: 1000, firstDelayMs: 0, log, registry });
    startWhatsAppTimer(b, { intervalMs: 1000, firstDelayMs: 0, log, registry });
    await vi.advanceTimersByTimeAsync(1500);
    expect(a).toHaveBeenCalled();
    expect(b).not.toHaveBeenCalled();
    stop();
  });
});
