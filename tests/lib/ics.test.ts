import { describe, expect, it } from "vitest";
import { buildIcs } from "@/lib/ics";

const NOW = new Date("2026-10-25T12:00:00.000Z");
const event = {
  uid: "abc-123@agenda.eneven.com.br",
  title: "Piercing hélix — Studio Defendi",
  // 14:30 em São Paulo (UTC-3) = 17:30Z
  startsAt: new Date("2026-10-28T14:30:00.000-03:00"),
  endsAt: new Date("2026-10-28T15:00:00.000-03:00"),
};

describe("buildIcs", () => {
  it("gera um calendário RFC 5545 em UTC com CRLF", () => {
    const ics = buildIcs(event, NOW);
    expect(ics.startsWith("BEGIN:VCALENDAR\r\n")).toBe(true);
    expect(ics.endsWith("END:VCALENDAR\r\n")).toBe(true);
    expect(ics).toContain("VERSION:2.0\r\n");
    expect(ics).toContain("PRODID:");
    expect(ics).toContain("BEGIN:VEVENT\r\n");
    expect(ics).toContain("UID:abc-123@agenda.eneven.com.br\r\n");
    expect(ics).toContain("DTSTAMP:20261025T120000Z\r\n");
    expect(ics).toContain("DTSTART:20261028T173000Z\r\n");
    expect(ics).toContain("DTEND:20261028T180000Z\r\n");
    expect(ics).toContain("END:VEVENT\r\n");
    // Nenhuma quebra de linha solta (só CRLF).
    expect(ics.replace(/\r\n/g, "")).not.toMatch(/[\r\n]/);
  });

  it("escapa vírgula, ponto e vírgula, barra e quebras de linha", () => {
    const ics = buildIcs(
      {
        ...event,
        title: "Corte, barba; e mais\\tudo",
        location: "Rua X, 120; sala 2",
        description: "Linha 1\nLinha 2",
      },
      NOW,
    );
    expect(ics).toContain("SUMMARY:Corte\\, barba\\; e mais\\\\tudo\r\n");
    expect(ics).toContain("LOCATION:Rua X\\, 120\\; sala 2\r\n");
    expect(ics).toContain("DESCRIPTION:Linha 1\\nLinha 2\r\n");
  });

  it("omite local e descrição quando não informados", () => {
    const ics = buildIcs(event, NOW);
    expect(ics).not.toContain("LOCATION");
    expect(ics).not.toContain("DESCRIPTION");
  });

  it("dobra linhas com mais de 75 bytes sem partir caracteres", () => {
    const ics = buildIcs({ ...event, title: "ção ".repeat(60).trim() }, NOW);
    const lines = ics.split("\r\n");
    for (const line of lines) expect(Buffer.byteLength(line, "utf8")).toBeLessThanOrEqual(75);
    // Desdobrando (CRLF + espaço) o texto volta inteiro.
    const unfolded = ics.replace(/\r\n /g, "");
    expect(unfolded).toContain(`SUMMARY:${"ção ".repeat(60).trim()}\r\n`);
  });

  it("recusa intervalo invertido", () => {
    expect(() => buildIcs({ ...event, endsAt: event.startsAt }, NOW)).toThrow();
  });
});
