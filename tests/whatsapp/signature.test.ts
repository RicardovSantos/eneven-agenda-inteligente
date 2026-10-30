import { createHmac } from "node:crypto";
import { describe, expect, it } from "vitest";
import { verifyMetaSignature } from "@/server/whatsapp/webhook";

describe("Meta Webhook Signature Verification", () => {
  const secret = "meta_app_secret_123456";
  const body = JSON.stringify({ object: "whatsapp_business_account", entry: [] });

  const sign = (data: string, sec: string) =>
    `sha256=${createHmac("sha256", sec).update(data).digest("hex")}`;

  it("aceita assinatura válida gerada com o segredo correto", () => {
    const validSignature = sign(body, secret);
    expect(verifyMetaSignature(body, validSignature, secret)).toBe(true);
  });

  it("rejeita assinatura gerada com segredo incorreto", () => {
    const invalidSignature = sign(body, "wrong_secret");
    expect(verifyMetaSignature(body, invalidSignature, secret)).toBe(false);
  });

  it("rejeita quando o corpo foi adulterado", () => {
    const validSignature = sign(body, secret);
    const tamperedBody = body + " ";
    expect(verifyMetaSignature(tamperedBody, validSignature, secret)).toBe(false);
  });

  it("rejeita quando cabeçalho ou segredo estão ausentes", () => {
    expect(verifyMetaSignature(body, null, secret)).toBe(false);
    expect(verifyMetaSignature(body, sign(body, secret), undefined)).toBe(false);
    expect(verifyMetaSignature(body, "invalido", secret)).toBe(false);
  });

  it("rejeita assinatura com sufixo inválido mesmo quando o hash inicial é válido", () => {
    expect(verifyMetaSignature(body, `${sign(body, secret)}zz`, secret)).toBe(false);
  });
});
