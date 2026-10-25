import { describe, expect, it } from "vitest";
import {
  contrastWithWhite,
  ensureReadableBrandColor,
  isHexColor,
} from "@/lib/color";

describe("ensureReadableBrandColor", () => {
  it("escurece uma cor clara até o contraste com branco chegar a 4.5", () => {
    const result = ensureReadableBrandColor("#F581FB");
    expect(result.adjusted).toBe(true);
    expect(result.color).not.toBe("#F581FB");
    expect(contrastWithWhite(result.color)).toBeGreaterThanOrEqual(4.5);
  });

  it("mantém uma cor que já tem contraste", () => {
    expect(ensureReadableBrandColor("#3E07D2")).toEqual({
      color: "#3E07D2",
      adjusted: false,
    });
  });

  it("normaliza minúsculas e a forma curta", () => {
    expect(ensureReadableBrandColor("#3e07d2").color).toBe("#3E07D2");
    expect(ensureReadableBrandColor("#000").color).toBe("#000000");
  });

  it("não perde o matiz ao escurecer", () => {
    const { color } = ensureReadableBrandColor("#FFD54F");
    const [r, g, b] = [1, 3, 5].map((i) => parseInt(color.slice(i, i + 2), 16));
    expect(r).toBeGreaterThanOrEqual(b);
    expect(g).toBeGreaterThanOrEqual(b);
  });

  it("branco vira uma cor legível (escurece até o limite)", () => {
    const result = ensureReadableBrandColor("#FFFFFF");
    expect(result.adjusted).toBe(true);
    expect(contrastWithWhite(result.color)).toBeGreaterThanOrEqual(4.5);
  });

  it("rejeita hex inválido", () => {
    for (const bad of ["", "azul", "#12", "#GGGGGG", "3E07D2", "#3E07D2FF"]) {
      expect(() => ensureReadableBrandColor(bad)).toThrow();
      expect(isHexColor(bad)).toBe(false);
    }
  });
});

describe("contrastWithWhite", () => {
  it("preto = 21 e branco = 1", () => {
    expect(contrastWithWhite("#000000")).toBeCloseTo(21, 1);
    expect(contrastWithWhite("#FFFFFF")).toBeCloseTo(1, 5);
  });
});
