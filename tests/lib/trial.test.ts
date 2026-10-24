import { describe, expect, it } from "vitest";
import { formatDayMonth, trialDaysLeft } from "@/lib/trial";

describe("trialDaysLeft", () => {
  const ends = new Date("2026-11-07T12:00:00Z");

  it("conta 14 dias logo após o cadastro", () => {
    expect(trialDaysLeft(ends, new Date("2026-10-24T12:00:00Z"))).toBe(14);
    expect(trialDaysLeft(ends, new Date("2026-10-24T12:00:05Z"))).toBe(14);
  });

  it("arredonda para cima dia parcial", () => {
    expect(trialDaysLeft(ends, new Date("2026-11-06T18:00:00Z"))).toBe(1);
  });

  it("nunca fica negativo", () => {
    expect(trialDaysLeft(ends, new Date("2026-11-07T12:00:00Z"))).toBe(0);
    expect(trialDaysLeft(ends, new Date("2026-12-01T00:00:00Z"))).toBe(0);
  });
});

describe("formatDayMonth", () => {
  it("formata dd/mm no fuso do estabelecimento", () => {
    expect(formatDayMonth(new Date("2026-11-07T12:00:00Z"), "America/Sao_Paulo")).toBe("07/11");
  });

  it("respeita a virada de dia pelo fuso", () => {
    expect(formatDayMonth(new Date("2026-11-08T01:30:00Z"), "America/Sao_Paulo")).toBe("07/11");
  });
});
