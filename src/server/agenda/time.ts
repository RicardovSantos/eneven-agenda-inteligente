import { TZDate } from "@date-fns/tz";

/** Utilitários de data/hora no fuso do tenant. Sem dependência do fuso do processo. */

const HM = /^([01]\d|2[0-3]):([0-5]\d)$/;
const YMD = /^(\d{4})-(\d{2})-(\d{2})$/;

/** "HH:mm" -> minutos desde a meia-noite. */
export function parseHm(value: string): number {
  const m = HM.exec(value);
  if (!m) throw new Error(`Horário inválido: ${value}`);
  return Number(m[1]) * 60 + Number(m[2]);
}

function parseYmd(date: string): [number, number, number] {
  const m = YMD.exec(date);
  if (!m) throw new Error(`Data inválida: ${date}`);
  return [Number(m[1]), Number(m[2]), Number(m[3])];
}

/** Instante UTC de uma data local ("yyyy-MM-dd") mais minutos desde 00:00, no fuso informado. */
export function zonedInstant(date: string, minutes: number, timezone: string): Date {
  const [y, mo, d] = parseYmd(date);
  const z = new TZDate(y, mo - 1, d, Math.floor(minutes / 60), minutes % 60, 0, 0, timezone);
  return new Date(z.getTime());
}

/** Data local ("yyyy-MM-dd") de um instante no fuso informado. */
export function localDateOf(instant: Date, timezone: string): string {
  const z = new TZDate(instant.getTime(), timezone);
  const mm = String(z.getMonth() + 1).padStart(2, "0");
  const dd = String(z.getDate()).padStart(2, "0");
  return `${String(z.getFullYear()).padStart(4, "0")}-${mm}-${dd}`;
}

/** Dia da semana de uma data de calendário (0 = domingo). Independe de fuso. */
export function weekdayOf(date: string): 0 | 1 | 2 | 3 | 4 | 5 | 6 {
  const [y, mo, d] = parseYmd(date);
  return new Date(Date.UTC(y, mo - 1, d)).getUTCDay() as 0 | 1 | 2 | 3 | 4 | 5 | 6;
}

/** Soma (ou subtrai) dias a uma data de calendário. */
export function addDaysToDate(date: string, days: number): string {
  const [y, mo, d] = parseYmd(date);
  return new Date(Date.UTC(y, mo - 1, d + days)).toISOString().slice(0, 10);
}

/** Diferença em dias de calendário (b - a). */
export function diffDays(a: string, b: string): number {
  const [ya, ma, da] = parseYmd(a);
  const [yb, mb, db] = parseYmd(b);
  return Math.round((Date.UTC(yb, mb - 1, db) - Date.UTC(ya, ma - 1, da)) / 86_400_000);
}
