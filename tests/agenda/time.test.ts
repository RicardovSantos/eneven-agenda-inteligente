import { describe, expect, it } from "vitest";
import {
  addDaysToDate,
  localDateOf,
  parseHm,
  weekdayOf,
  zonedInstant,
} from "@/server/agenda/time";

const SP = "America/Sao_Paulo";

describe("parseHm", () => {
  it("converte HH:mm em minutos desde a meia-noite", () => {
    expect(parseHm("00:00")).toBe(0);
    expect(parseHm("09:05")).toBe(545);
    expect(parseHm("18:30")).toBe(1110);
  });
  it("rejeita formato inválido", () => {
    expect(() => parseHm("9h")).toThrow();
    expect(() => parseHm("25:00")).toThrow();
    expect(() => parseHm("10:60")).toThrow();
  });
});

describe("zonedInstant", () => {
  it("converte data+minutos do fuso do tenant em instante UTC", () => {
    expect(zonedInstant("2026-10-28", parseHm("09:00"), SP).toISOString()).toBe(
      "2026-10-28T12:00:00.000Z",
    );
    expect(zonedInstant("2026-10-28", parseHm("23:30"), "UTC").toISOString()).toBe(
      "2026-10-28T23:30:00.000Z",
    );
  });
  it("respeita o horário de verão de outro fuso", () => {
    expect(zonedInstant("2026-07-01", 9 * 60, "America/New_York").toISOString()).toBe(
      "2026-07-01T13:00:00.000Z",
    );
    expect(zonedInstant("2026-01-05", 9 * 60, "America/New_York").toISOString()).toBe(
      "2026-01-05T14:00:00.000Z",
    );
  });
});

describe("localDateOf", () => {
  it("devolve a data local do tenant (virada de dia)", () => {
    expect(localDateOf(new Date("2026-10-28T02:30:00Z"), SP)).toBe("2026-10-27");
    expect(localDateOf(new Date("2026-10-28T03:00:00Z"), SP)).toBe("2026-10-28");
  });
});

describe("weekdayOf / addDaysToDate", () => {
  it("dia da semana do calendário (0 = domingo)", () => {
    expect(weekdayOf("2026-11-01")).toBe(0);
    expect(weekdayOf("2026-10-28")).toBe(3);
  });
  it("soma dias atravessando mês e ano", () => {
    expect(addDaysToDate("2026-10-27", 60)).toBe("2026-12-26");
    expect(addDaysToDate("2026-12-31", 1)).toBe("2027-01-01");
  });
});
