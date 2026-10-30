import { expect, it, vi } from "vitest";
import { assertAllowedPushEndpoint, selectPublicPushAddress, sendTestPush } from "@/server/push/test-transport";

it("aceita apenas provedores conhecidos com HTTPS", () => {
  for (const url of ["https://fcm.googleapis.com/fcm/send/abc", "https://updates.push.services.mozilla.com/wpush/abc", "https://web.push.apple.com/abc"]) expect(assertAllowedPushEndpoint(url)).toBeInstanceOf(URL);
  for (const url of ["https://fcm.googleapis.com.evil.example/a", "https://push.apple.com.evil.example/a", "https://push.apple.com/a", "http://fcm.googleapis.com/a", "https://fcm.googleapis.com:444/a", "https://user@fcm.googleapis.com/a"]) expect(() => assertAllowedPushEndpoint(url)).toThrow();
});

it("recusa DNS com IPs locais, privados, mapeados ou resposta mista", () => {
  for (const address of ["127.0.0.1", "10.0.0.1", "169.254.169.254", "::1", "fd00::1", "::ffff:127.0.0.1"]) expect(() => selectPublicPushAddress([{ address, family: address.includes(":") ? 6 : 4 }])).toThrow();
  expect(() => selectPublicPushAddress([{ address: "8.8.8.8", family: 4 }, { address: "10.0.0.1", family: 4 }])).toThrow();
  expect(selectPublicPushAddress([{ address: "8.8.8.8", family: 4 }])).toEqual({ address: "8.8.8.8", family: 4 });
});

it("recusa envio em produção antes de consultar ou enviar dados", async () => {
  try {
    vi.stubEnv("NODE_ENV", "production");
    await expect(sendTestPush(null, "booking_created", { publicKey: "", privateKey: "", subject: "" })).rejects.toThrow("produção");
  } finally { vi.unstubAllEnvs(); }
});
