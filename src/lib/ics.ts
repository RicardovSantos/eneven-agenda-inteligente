/**
 * Arquivo de calendário (.ics, RFC 5545) de um agendamento. Função pura: datas
 * em UTC, quebras de linha CRLF, textos escapados e linhas dobradas em 75 bytes.
 */

export type IcsEvent = {
  uid: string;
  title: string;
  startsAt: Date;
  endsAt: Date;
  location?: string | null;
  description?: string | null;
};

const PRODID = "-//Eneven Agendamentos Inteligentes//Agenda//PT-BR";
const MAX_LINE_BYTES = 75;

/** `2026-10-28T17:30:00.000Z` -> `20261028T173000Z`. */
function utc(date: Date): string {
  return date.toISOString().replace(/[-:]/g, "").replace(/\.\d{3}Z$/, "Z");
}

/** Escape de TEXT (RFC 5545, 3.3.11). */
function escapeText(value: string): string {
  return value
    .replace(/\\/g, "\\\\")
    .replace(/;/g, "\\;")
    .replace(/,/g, "\\,")
    .replace(/\r\n|\r|\n/g, "\\n");
}

/** Dobra em linhas de até 75 bytes UTF-8; continuação começa com um espaço. */
function fold(line: string): string {
  if (Buffer.byteLength(line, "utf8") <= MAX_LINE_BYTES) return line;
  const parts: string[] = [];
  let current = "";
  let bytes = 0;
  // A continuação gasta 1 byte com o espaço inicial.
  let limit = MAX_LINE_BYTES;
  for (const char of line) {
    const size = Buffer.byteLength(char, "utf8");
    if (bytes + size > limit) {
      parts.push(current);
      current = "";
      bytes = 0;
      limit = MAX_LINE_BYTES - 1;
    }
    current += char;
    bytes += size;
  }
  parts.push(current);
  return parts.join("\r\n ");
}

export function buildIcs(event: IcsEvent, now: Date = new Date()): string {
  if (!(event.endsAt.getTime() > event.startsAt.getTime())) {
    throw new Error("O fim do evento deve ser depois do início");
  }
  const lines = [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    `PRODID:${PRODID}`,
    "CALSCALE:GREGORIAN",
    "METHOD:PUBLISH",
    "BEGIN:VEVENT",
    `UID:${escapeText(event.uid)}`,
    `DTSTAMP:${utc(now)}`,
    `DTSTART:${utc(event.startsAt)}`,
    `DTEND:${utc(event.endsAt)}`,
    `SUMMARY:${escapeText(event.title)}`,
  ];
  if (event.location) lines.push(`LOCATION:${escapeText(event.location)}`);
  if (event.description) lines.push(`DESCRIPTION:${escapeText(event.description)}`);
  lines.push("STATUS:CONFIRMED", "END:VEVENT", "END:VCALENDAR");
  return lines.map(fold).join("\r\n") + "\r\n";
}
