import { describe, expect, it } from "vitest";
import { formatWeekRange } from "@/lib/dates";
import { assignLanes, gridRange, weekDates } from "@/lib/week-layout";

describe("weekDates", () => {
  it("vai de domingo a sábado da semana da data", () => {
    // 2026-11-17 é terça-feira.
    expect(weekDates("2026-11-17")).toEqual([
      "2026-11-15", "2026-11-16", "2026-11-17", "2026-11-18", "2026-11-19", "2026-11-20", "2026-11-21",
    ]);
    expect(weekDates("2026-11-15")[0]).toBe("2026-11-15"); // domingo
    expect(weekDates("2026-11-21")[6]).toBe("2026-11-21"); // sábado
  });
  it("atravessa o mês", () => {
    expect(weekDates("2026-12-01")[0]).toBe("2026-11-29");
    expect(weekDates("2026-12-01")[6]).toBe("2026-12-05");
  });
});

describe("formatWeekRange", () => {
  it("mesma semana no mesmo mês", () => {
    expect(formatWeekRange("2026-11-15", "2026-11-21", "2026-11-15")).toBe("15 – 21 de novembro");
  });
  it("atravessa meses", () => {
    expect(formatWeekRange("2026-11-29", "2026-12-05", "2026-11-15")).toBe("29 de nov – 5 de dez");
  });
  it("mostra o ano quando difere do de referência ou muda no meio", () => {
    expect(formatWeekRange("2027-01-03", "2027-01-09", "2026-11-15")).toBe("3 – 9 de janeiro 2027");
    expect(formatWeekRange("2026-12-27", "2027-01-02", "2026-12-28")).toBe("27 de dez 2026 – 2 de jan 2027");
  });
});

describe("assignLanes", () => {
  it("itens que não se sobrepõem ficam em faixa única", () => {
    const r = assignLanes([
      { id: "a", start: 540, end: 600 },
      { id: "b", start: 600, end: 660 },
    ]);
    expect(r.get("a")).toEqual({ lane: 0, lanes: 1 });
    expect(r.get("b")).toEqual({ lane: 0, lanes: 1 });
  });
  it("dois simultâneos dividem a largura", () => {
    const r = assignLanes([
      { id: "a", start: 630, end: 660 },
      { id: "b", start: 630, end: 675 },
    ]);
    expect(r.get("a")).toEqual({ lane: 0, lanes: 2 });
    expect(r.get("b")).toEqual({ lane: 1, lanes: 2 });
  });
  it("um item reaproveita a faixa livre e o grupo usa o máximo de faixas", () => {
    const r = assignLanes([
      { id: "a", start: 540, end: 700 },
      { id: "b", start: 560, end: 600 },
      { id: "c", start: 610, end: 650 }, // cabe na faixa do b (já terminou)
      { id: "d", start: 800, end: 830 }, // grupo novo
    ]);
    expect(r.get("a")).toEqual({ lane: 0, lanes: 2 });
    expect(r.get("b")).toEqual({ lane: 1, lanes: 2 });
    expect(r.get("c")).toEqual({ lane: 1, lanes: 2 });
    expect(r.get("d")).toEqual({ lane: 0, lanes: 1 });
  });
});

describe("gridRange", () => {
  it("usa 08:00–19:00 sem horário de funcionamento", () => {
    expect(gridRange(null, [])).toEqual({ startMin: 480, endMin: 1140 });
  });
  it("usa o horário de funcionamento e arredonda para a hora cheia", () => {
    expect(gridRange({ startMin: 9 * 60 + 30, endMin: 18 * 60 + 15 }, [])).toEqual({ startMin: 540, endMin: 1140 });
  });
  it("cresce para caber um item fora do expediente", () => {
    expect(gridRange({ startMin: 540, endMin: 1080 }, [{ start: 7 * 60 + 45, end: 20 * 60 + 10 }])).toEqual({
      startMin: 420,
      endMin: 1260,
    });
  });
});
