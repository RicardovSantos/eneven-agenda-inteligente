import { describe, expect, it } from "vitest";
import { describeOpening, publicSubtitle } from "@/lib/opening";

const day = [
  { start: "09:00", end: "12:00" },
  { start: "13:00", end: "19:00" },
];

describe("describeOpening", () => {
  it("aberto agora: 'Aberto hoje até 19h' usa o fim do expediente corrente", () => {
    expect(describeOpening([{ start: "09:00", end: "19:00" }], 10 * 60)).toBe("Aberto hoje até 19h");
    expect(describeOpening([{ start: "09:00", end: "18:30" }], 10 * 60)).toBe("Aberto hoje até 18h30");
  });

  it("no intervalo ou antes de abrir: diz quando abre", () => {
    expect(describeOpening(day, 12 * 60 + 30)).toBe("Abre hoje às 13h");
    expect(describeOpening(day, 7 * 60)).toBe("Abre hoje às 9h");
  });

  it("depois de fechar: fechado agora; sem expediente: fechado hoje", () => {
    expect(describeOpening(day, 19 * 60)).toBe("Fechado agora");
    expect(describeOpening([], 10 * 60)).toBe("Fechado hoje");
  });

  it("aberto no primeiro período mostra o fim dele", () => {
    expect(describeOpening(day, 10 * 60)).toBe("Aberto hoje até 12h");
  });
});

describe("publicSubtitle", () => {
  it("junta endereço e horário (no máximo dois itens)", () => {
    expect(publicSubtitle("Rua X, 120", "Aberto hoje até 19h")).toBe("Rua X, 120 · Aberto hoje até 19h");
    expect(publicSubtitle(null, "Fechado hoje")).toBe("Fechado hoje");
    expect(publicSubtitle("", null)).toBeNull();
  });
});
