import { describe, expect, it } from "vitest";
import { summarizeWeek } from "@/lib/hours-summary";
import { emptyWeek } from "@/lib/weekly-hours";

const r = (start: string, end: string) => ({ start, end });

describe("summarizeWeek", () => {
  it("junta dias seguidos com o mesmo horário", () => {
    const week = { ...emptyWeek() };
    for (const d of [1, 2, 3, 4, 5] as const) week[d] = [r("09:00", "18:00")];
    expect(summarizeWeek(week)).toBe("Seg a Sex 9h–18h");
  });

  it("separa grupos e mostra minutos e vários intervalos", () => {
    const week = { ...emptyWeek() };
    for (const d of [1, 2, 3, 4, 5] as const) week[d] = [r("09:00", "12:00"), r("13:30", "18:00")];
    week[6] = [r("09:00", "13:00")];
    expect(summarizeWeek(week)).toBe("Seg a Sex 9h–12h, 13h30–18h · Sáb 9h–13h");
  });

  it("não junta dias com folga no meio nem com horários diferentes", () => {
    const week = { ...emptyWeek(), 1: [r("09:00", "18:00")], 3: [r("09:00", "18:00")], 4: [r("10:00", "18:00")] };
    expect(summarizeWeek(week)).toBe("Seg 9h–18h · Qua 9h–18h · Qui 10h–18h");
  });

  it("dois dias seguidos usam 'e'; domingo vem por último", () => {
    expect(summarizeWeek({ ...emptyWeek(), 6: [r("09:00", "13:00")], 0: [r("09:00", "13:00")] })).toBe(
      "Sáb e Dom 9h–13h",
    );
  });

  it("sem expediente", () => {
    expect(summarizeWeek(emptyWeek())).toBe("Sem horário");
  });
});
