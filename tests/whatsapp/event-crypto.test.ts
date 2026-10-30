import { describe, expect, it } from "vitest";
import { decryptInboundEvent, encryptInboundEvent } from "@/server/whatsapp/event-crypto";

describe("proteção de eventos para recuperação", () => {
  it("cifra o conteúdo e recusa adulteração ou troca de ID", () => {
    const content = { token: "token-secreto", phone: "5511999990000" };
    const encrypted = encryptInboundEvent("wamid.1", content);
    expect(encrypted).not.toContain(content.token);
    expect(encrypted).not.toContain(content.phone);
    expect(decryptInboundEvent("wamid.1", encrypted)).toEqual(content);
    expect(() => decryptInboundEvent("wamid.2", encrypted)).toThrow();
    const parts = encrypted.split(".");
    parts[2] = `${parts[2][0] === "A" ? "B" : "A"}${parts[2].slice(1)}`;
    expect(() => decryptInboundEvent("wamid.1", parts.join("."))).toThrow();
  });
});
