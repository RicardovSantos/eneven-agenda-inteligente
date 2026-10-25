import { describe, expect, it } from "vitest";
import { emptyWeek, validateWeeklyHours } from "@/lib/weekly-hours";

describe("validateWeeklyHours", () => {
  it("semana vazia é válida", () => {
    expect(validateWeeklyHours(emptyWeek())).toEqual({});
  });

  it("aponta o dia com sobreposição, início >= fim e formato inválido", () => {
    const week = emptyWeek();
    week[1] = [
      { start: "09:00", end: "13:00" },
      { start: "12:30", end: "18:00" },
    ];
    week[2] = [{ start: "10:00", end: "10:00" }];
    week[3] = [{ start: "25:00", end: "26:00" }];
    const errors = validateWeeklyHours(week);
    expect(Object.keys(errors).sort()).toEqual(["1", "2", "3"]);
    expect(errors[1]).toMatch(/sobrepor/);
  });

  it("intervalos fora de ordem e encostados são aceitos", () => {
    const week = emptyWeek();
    week[4] = [
      { start: "13:00", end: "18:00" },
      { start: "09:00", end: "13:00" },
    ];
    expect(validateWeeklyHours(week)).toEqual({});
  });
});
