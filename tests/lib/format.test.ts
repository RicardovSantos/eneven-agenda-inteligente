import { describe, expect, it } from "vitest";
import { centsFromDigits, formatBRL, formatDuration } from "@/lib/format";
import { emptyWeek, outsideBusinessHours } from "@/lib/weekly-hours";
import {
  PROFESSIONAL_COLORS,
  isProfessionalColor,
  nextProfessionalColor,
} from "@/lib/professional-colors";

describe("formatBRL", () => {
  it("usa vírgula, ponto de milhar e R$", () => {
    expect(formatBRL(123450)).toBe("R$ 1.234,50");
    expect(formatBRL(9000)).toBe("R$ 90,00");
    expect(formatBRL(0)).toBe("R$ 0,00");
  });
});

describe("formatDuration", () => {
  it.each([
    [5, "5 min"],
    [30, "30 min"],
    [60, "1 h"],
    [75, "1 h 15 min"],
    [240, "4 h"],
  ])("%i -> %s", (min, text) => expect(formatDuration(min)).toBe(text));
});

describe("centsFromDigits", () => {
  it("só os dígitos viram centavos", () => {
    expect(centsFromDigits("")).toBe(0);
    expect(centsFromDigits("R$ 90,00")).toBe(9000);
    expect(centsFromDigits("9")).toBe(9);
    expect(centsFromDigits("0009")).toBe(9);
    expect(centsFromDigits("abc")).toBe(0);
  });
  it("limita o valor máximo", () => {
    expect(centsFromDigits("99999999999999")).toBeLessThanOrEqual(99_999_999);
  });
});

describe("paleta de profissionais", () => {
  it("escolhe a primeira cor ainda não usada", () => {
    expect(nextProfessionalColor([])).toBe(PROFESSIONAL_COLORS[0]);
    expect(nextProfessionalColor(["#3e07d2", "#0E7C86"])).toBe(PROFESSIONAL_COLORS[2]);
    expect(nextProfessionalColor([...PROFESSIONAL_COLORS])).toBe(PROFESSIONAL_COLORS[0]);
    expect(isProfessionalColor("#b4237a")).toBe(true);
    expect(isProfessionalColor("#000000")).toBe(false);
  });
});

describe("outsideBusinessHours", () => {
  const business = { ...emptyWeek(), 1: [{ start: "09:00", end: "18:00" }] };
  it("aponta só os dias fora da janela", () => {
    const errors = outsideBusinessHours(
      {
        ...emptyWeek(),
        1: [{ start: "08:30", end: "12:00" }],
        2: [{ start: "09:00", end: "10:00" }],
      },
      business,
    );
    expect(Object.keys(errors).sort()).toEqual(["1", "2"]);
    expect(
      outsideBusinessHours({ ...emptyWeek(), 1: [{ start: "09:00", end: "18:00" }] }, business),
    ).toEqual({});
  });
});
