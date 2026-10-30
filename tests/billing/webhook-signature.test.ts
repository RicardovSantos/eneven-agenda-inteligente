import { createHmac } from "node:crypto";
import { describe, expect, it } from "vitest";
import { verifyMercadoPagoSignature } from "@/server/billing/webhook-signature";

describe("assinatura do webhook Mercado Pago", () => {
  const timestamp = "1704908010";
  const digest = createHmac("sha256", "secret").update(`id:123;request-id:request-1;ts:${timestamp};`).digest("hex");
  const input = { signature: `ts=${timestamp},v1=${digest}`, requestId: "request-1", dataId: "123", secret: "secret", now: new Date(Number(timestamp) * 1000) };

  it("aceita assinatura válida e rejeita troca de identificador ou segredo", () => {
    expect(verifyMercadoPagoSignature(input)).toBe(true);
    expect(verifyMercadoPagoSignature({ ...input, dataId: "124" })).toBe(false);
    expect(verifyMercadoPagoSignature({ ...input, requestId: "outro" })).toBe(false);
    expect(verifyMercadoPagoSignature({ ...input, secret: "outra" })).toBe(false);
  });

  it("rejeita campos ausentes, assinatura ambígua e prazo excedido", () => {
    expect(verifyMercadoPagoSignature({ ...input, secret: undefined })).toBe(false);
    expect(verifyMercadoPagoSignature({ ...input, signature: `${input.signature},ts=${timestamp}` })).toBe(false);
    expect(verifyMercadoPagoSignature({ ...input, now: new Date((Number(timestamp) + 301) * 1000) })).toBe(false);
    expect(verifyMercadoPagoSignature({ ...input, signature: `ts=${timestamp},v1=zz` })).toBe(false);
  });
});
