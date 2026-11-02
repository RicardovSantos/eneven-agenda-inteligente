import { describe, expect, it } from "vitest";
import { describeSendFailure, sanitizeMetaError } from "@/server/whatsapp/failure";

describe("erro devolvido pela Meta", () => {
  it("mantém o motivo e o identificador da conta", () => {
    const text = "(#10) Viewer cannot access the provided Paid Message Account 1834961840853477";
    expect(sanitizeMetaError(text)).toBe(text);
  });

  it("remove telefones, e-mails e links", () => {
    const text = "Falha para 5511960948053 e (11) 96094-8053 e +55 11 96094-8053, ana@exemplo.com.br, https://agenda.eneven.com.br/agendamento/abc";
    const clean = sanitizeMetaError(text);
    expect(clean).not.toMatch(/\d{8}/);
    expect(clean).not.toContain("@");
    expect(clean).not.toContain("http");
    expect(clean).toContain("[telefone]");
  });

  it("limita o tamanho do motivo", () => {
    expect(sanitizeMetaError("x".repeat(1000))).toHaveLength(300);
  });

  it("junta código e subcódigo", () => {
    expect(describeSendFailure({ error: "erro", code: "131047", subcode: 2494073 })).toEqual({ code: "131047/2494073", reason: "erro" });
    expect(describeSendFailure({ error: "erro" })).toEqual({ code: null, reason: "erro" });
  });
});
