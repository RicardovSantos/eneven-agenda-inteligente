import { createECDH } from "node:crypto";
import { expect, it } from "vitest";
import { validatePushSubscription } from "@/server/push/validate-subscription";

function valid() {
  const ecdh = createECDH("prime256v1");
  ecdh.generateKeys();
  return { endpoint: "https://push.example/device/123", keys: { p256dh: ecdh.getPublicKey().toString("base64url"), auth: Buffer.alloc(16, 5).toString("base64url") } };
}

it("aceita inscrição válida e descarta campos inesperados", () => {
  const subscription = valid();
  expect(validatePushSubscription({ ...subscription, tenantId: "outra-conta" })).toEqual({ endpoint: subscription.endpoint, ...subscription.keys });
});

it("rejeita endpoints inseguros, chaves inválidas e dados incompletos", () => {
  const subscription = valid();
  for (const endpoint of ["http://push.example/device", "https://user:pass@push.example/device", "https://push.example:8443/device", "https://push.example/device#fragment", "https://push.example/" + "a".repeat(2100)]) {
    expect(() => validatePushSubscription({ ...subscription, endpoint })).toThrow();
  }
  expect(() => validatePushSubscription({ ...subscription, keys: { ...subscription.keys, auth: "bad" } })).toThrow();
  expect(() => validatePushSubscription({ ...subscription, keys: { ...subscription.keys, p256dh: Buffer.alloc(65, 4).toString("base64url") } })).toThrow();
  expect(() => validatePushSubscription(null)).toThrow();
});
