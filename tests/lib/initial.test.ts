import { describe, expect, it } from "vitest";
import { initialOf } from "@/lib/initial";

describe("initialOf", () => {
  it("devolve a primeira letra do nome em maiúscula", () => {
    expect(initialOf("Bia Lima")).toBe("B");
    expect(initialOf("  ana souza ")).toBe("A");
    expect(initialOf("érica")).toBe("É");
  });

  it("ignora símbolos e emojis do começo", () => {
    expect(initialOf("✨ Carla")).toBe("C");
    expect(initialOf("(Duda)")).toBe("D");
  });

  it("nome vazio ou sem letras vira ponto de interrogação", () => {
    expect(initialOf("")).toBe("?");
    expect(initialOf("   ")).toBe("?");
    expect(initialOf("123")).toBe("?");
  });
});
