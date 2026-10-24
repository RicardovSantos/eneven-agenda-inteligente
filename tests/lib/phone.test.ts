import { describe, expect, it } from "vitest";
import { formatBrazilPhone, normalizeBrazilPhone } from "@/lib/phone";

describe("normalizeBrazilPhone", () => {
  it("normaliza celular com máscara", () => {
    expect(normalizeBrazilPhone("(11) 99999-9999")).toBe("5511999999999");
  });

  it("aceita só dígitos (11 dígitos)", () => {
    expect(normalizeBrazilPhone("11999999999")).toBe("5511999999999");
  });

  it("aceita fixo com 10 dígitos", () => {
    expect(normalizeBrazilPhone("(11) 3333-4444")).toBe("551133334444");
  });

  it("aceita +55 e 55 na frente, com ou sem máscara", () => {
    expect(normalizeBrazilPhone("+55 (11) 99999-9999")).toBe("5511999999999");
    expect(normalizeBrazilPhone("5511999999999")).toBe("5511999999999");
    expect(normalizeBrazilPhone("+55 11 3333-4444")).toBe("551133334444");
  });

  it("não confunde DDD 55 com código do país", () => {
    expect(normalizeBrazilPhone("(55) 99999-9999")).toBe("5555999999999");
    expect(normalizeBrazilPhone("55999999999")).toBe("5555999999999");
  });

  it("rejeita números curtos, longos ou sem DDD", () => {
    expect(normalizeBrazilPhone("99999-9999")).toBeNull();
    expect(normalizeBrazilPhone("123")).toBeNull();
    expect(normalizeBrazilPhone("")).toBeNull();
    expect(normalizeBrazilPhone("119999999999")).toBeNull();
    expect(normalizeBrazilPhone("abc")).toBeNull();
  });

  it("rejeita DDD inválido e celular de 11 dígitos sem o 9", () => {
    expect(normalizeBrazilPhone("(01) 99999-9999")).toBeNull();
    expect(normalizeBrazilPhone("(11) 89999-9999")).toBeNull();
  });
});

describe("formatBrazilPhone", () => {
  it("aplica a máscara progressivamente", () => {
    expect(formatBrazilPhone("")).toBe("");
    expect(formatBrazilPhone("1")).toBe("(1");
    expect(formatBrazilPhone("11")).toBe("(11");
    expect(formatBrazilPhone("119")).toBe("(11) 9");
    expect(formatBrazilPhone("1199999")).toBe("(11) 9999-9");
    expect(formatBrazilPhone("11999999999")).toBe("(11) 99999-9999");
  });

  it("limita a 11 dígitos e ignora letras", () => {
    expect(formatBrazilPhone("11999999999999")).toBe("(11) 99999-9999");
    expect(formatBrazilPhone("(11) 9a9b")).toBe("(11) 99");
  });

  it("remove o +55 colado", () => {
    expect(formatBrazilPhone("+5511999999999")).toBe("(11) 99999-9999");
  });
});
