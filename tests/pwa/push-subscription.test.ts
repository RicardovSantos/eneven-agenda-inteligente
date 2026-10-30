import { afterEach, expect, it, vi } from "vitest";
import { enablePushForDevice } from "@/lib/push-subscription";

const key = Buffer.concat([Buffer.from([4]), Buffer.alloc(64, 1)]).toString("base64url");
afterEach(() => vi.unstubAllGlobals());

it("pede permissão ao ativar, inscreve o dispositivo e chama o salvamento", async () => {
  const permission = vi.fn(async () => "granted");
  const subscription = { toJSON: () => ({ endpoint: "https://push.example/subscription" }) };
  const subscribe = vi.fn(async () => subscription);
  vi.stubGlobal("Notification", { requestPermission: permission });
  vi.stubGlobal("window", { Notification: {}, PushManager: {} });
  vi.stubGlobal("navigator", { serviceWorker: { getRegistration: async () => ({ active: {}, pushManager: { getSubscription: async () => null, subscribe } }) } });
  const save = vi.fn(async () => {});
  expect(permission).not.toHaveBeenCalled();
  expect(await enablePushForDevice(key, save)).toBe("enabled");
  expect(subscribe).toHaveBeenCalledOnce();
  expect(save).toHaveBeenCalledWith({ endpoint: "https://push.example/subscription" });
});

it("não inscreve quando a permissão é negada e rejeita chave inválida antes de pedir permissão", async () => {
  const permission = vi.fn(async () => "denied");
  const getRegistration = vi.fn();
  vi.stubGlobal("Notification", { requestPermission: permission });
  vi.stubGlobal("window", { Notification: {}, PushManager: {} });
  vi.stubGlobal("navigator", { serviceWorker: { getRegistration } });
  await expect(enablePushForDevice("inválida", async () => {})).rejects.toThrow("inválida");
  expect(permission).not.toHaveBeenCalled();
  expect(await enablePushForDevice(key, async () => {})).toBe("denied");
  expect(getRegistration).not.toHaveBeenCalled();
});

it("rejeita inscrição existente de outra chave sem sobrescrevê-la", async () => {
  const save = vi.fn();
  const existing = { options: { applicationServerKey: new Uint8Array(65).buffer } };
  vi.stubGlobal("Notification", { requestPermission: async () => "granted" });
  vi.stubGlobal("window", { Notification: {}, PushManager: {} });
  vi.stubGlobal("navigator", { serviceWorker: { getRegistration: async () => ({ active: {}, pushManager: { getSubscription: async () => existing } }) } });
  await expect(enablePushForDevice(key, save)).rejects.toThrow("outra chave");
  expect(save).not.toHaveBeenCalled();
});

it("reutiliza a inscrição se o salvamento falhar e for tentado de novo", async () => {
  const unsubscribe = vi.fn();
  const existing = { options: { applicationServerKey: Uint8Array.from(Buffer.from(key, "base64url")).buffer }, toJSON: () => ({ endpoint: "https://push.example/subscription" }), unsubscribe };
  vi.stubGlobal("Notification", { requestPermission: async () => "granted" });
  vi.stubGlobal("window", { Notification: {}, PushManager: {} });
  vi.stubGlobal("navigator", { serviceWorker: { getRegistration: async () => ({ active: {}, pushManager: { getSubscription: async () => existing } }) } });
  await expect(enablePushForDevice(key, async () => { throw new Error("indisponível"); })).rejects.toThrow("indisponível");
  expect(unsubscribe).not.toHaveBeenCalled();
  expect(await enablePushForDevice(key, async () => {})).toBe("enabled");
});
