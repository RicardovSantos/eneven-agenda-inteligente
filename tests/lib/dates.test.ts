import { describe, expect, it } from "vitest";
import {
  dayOfMonth,
  formatLongDate,
  formatMonthLabel,
  formatMonthRange,
  formatShortDate,
  formatTime,
  monthShort,
  periodOf,
  weekdayShort,
} from "@/lib/dates";
import { initialsOf } from "@/lib/initial";

describe("datas em pt-BR", () => {
  it("data longa com o dia da semana em maiúscula", () => {
    expect(formatLongDate("2026-10-28")).toBe("Quarta, 28 de outubro");
    expect(formatLongDate("2026-10-27")).toBe("Terça, 27 de outubro");
    expect(formatLongDate("2027-01-02")).toBe("Sábado, 2 de janeiro");
  });

  it("data curta dd/mm", () => {
    expect(formatShortDate("2026-10-28")).toBe("Quarta, 28/10");
  });

  it("dia da semana abreviado, dia e mês", () => {
    expect(weekdayShort("2026-10-28")).toBe("Qua");
    expect(weekdayShort("2026-10-31")).toBe("Sáb");
    expect(weekdayShort("2026-11-01")).toBe("Dom");
    expect(dayOfMonth("2026-10-02")).toBe(2);
    expect(monthShort("2026-10-02")).toBe("out");
  });

  it("horário no fuso do estabelecimento", () => {
    const instant = new Date("2026-10-28T17:30:00.000Z");
    expect(formatTime(instant, "America/Sao_Paulo")).toBe("14:30");
    expect(formatTime(instant, "America/Manaus")).toBe("13:30");
  });

  it("período do dia: manhã, tarde e noite", () => {
    expect(periodOf("09:00")).toBe("Manhã");
    expect(periodOf("11:45")).toBe("Manhã");
    expect(periodOf("12:00")).toBe("Tarde");
    expect(periodOf("17:59")).toBe("Tarde");
    expect(periodOf("18:00")).toBe("Noite");
  });
});

describe("formatMonthRange", () => {
  it("um mês com ano; dois meses sem ano; virada de ano com os dois", () => {
    expect(formatMonthRange("2026-10-26", "2026-10-31")).toBe("Outubro 2026");
    expect(formatMonthRange("2026-10-26", "2026-11-20")).toBe("Outubro – Novembro");
    expect(formatMonthRange("2026-12-20", "2027-01-10")).toBe("Dezembro 2026 – Janeiro 2027");
  });
});

describe("initialsOf", () => {
  it("até duas letras, das duas primeiras palavras", () => {
    expect(initialsOf("Studio Defendi")).toBe("SD");
    expect(initialsOf("salão da maria josé")).toBe("SD");
    expect(initialsOf("Bia")).toBe("B");
    expect(initialsOf("  ")).toBe("?");
    expect(initialsOf("✂ Estúdio X")).toBe("EX");
  });
});

describe("formatMonthLabel", () => {
  it("mostra só o mês do dia, e o ano quando difere do de referência", () => {
    expect(formatMonthLabel("2026-10-28")).toBe("Outubro");
    expect(formatMonthLabel("2026-12-20", "2026-10-25")).toBe("Dezembro");
    expect(formatMonthLabel("2027-01-05", "2026-10-25")).toBe("Janeiro 2027");
  });
});
