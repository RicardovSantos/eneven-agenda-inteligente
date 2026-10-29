import { describe, expect, it } from "vitest";
import {
  compareRealized,
  formatBRLShort,
  formatPercent,
  monthLabel,
  parseMonthParam,
  shiftMonth,
} from "@/lib/dashboard-view";

describe("mês da visão geral", () => {
  it("aceita yyyy-MM válido e cai no mês atual quando inválido", () => {
    expect(parseMonthParam("2026-09", "2026-10")).toBe("2026-09");
    for (const bad of [undefined, "", "2026-13", "2026-00", "26-10", "2026-1", "abc", ["2026-09"], "2026-10-01"]) {
      expect(parseMonthParam(bad as string | undefined, "2026-10")).toBe("2026-10");
    }
  });

  it("anda para o mês anterior e o seguinte, virando o ano", () => {
    expect(shiftMonth("2026-10", -1)).toBe("2026-09");
    expect(shiftMonth("2026-01", -1)).toBe("2025-12");
    expect(shiftMonth("2026-12", 1)).toBe("2027-01");
  });

  it("rotula o mês em português", () => {
    expect(monthLabel("2026-10")).toBe("Outubro de 2026");
    expect(monthLabel("2027-03")).toBe("Março de 2027");
  });
});

describe("números", () => {
  it("compara com o mês anterior: só quando houve faturamento antes", () => {
    expect(compareRealized(742000, 0)).toBeNull();
    expect(compareRealized(742000, 680734)).toEqual({ direction: "up", percent: 9 });
    expect(compareRealized(500000, 1000000)).toEqual({ direction: "down", percent: 50 });
    expect(compareRealized(1000000, 1000000)).toEqual({ direction: "same", percent: 0 });
    expect(compareRealized(0, 1000000)).toEqual({ direction: "down", percent: 100 });
  });

  it("percentual com uma casa e vírgula", () => {
    expect(formatPercent(3 / 87)).toBe("3,4%");
    expect(formatPercent(3 / 102)).toBe("2,9%");
    expect(formatPercent(0)).toBe("0%");
    expect(formatPercent(null)).toBe("—");
  });

  it("valor curto (celular) sem centavos quando redondo", () => {
    expect(formatBRLShort(742000)).toBe("R$ 7.420");
    expect(formatBRLShort(742050)).toBe("R$ 7.420,50");
  });
});
