/**
 * Datas e horas em pt-BR para a página pública. Funções puras (sem imports de
 * servidor), usadas no servidor e no navegador. Datas de calendário são
 * "yyyy-MM-dd" e independem de fuso; instantes precisam do fuso do salão.
 */

const WEEKDAYS = [
  "Domingo",
  "Segunda",
  "Terça",
  "Quarta",
  "Quinta",
  "Sexta",
  "Sábado",
];
const MONTHS = [
  "janeiro",
  "fevereiro",
  "março",
  "abril",
  "maio",
  "junho",
  "julho",
  "agosto",
  "setembro",
  "outubro",
  "novembro",
  "dezembro",
];

function parts(date: string): { y: number; m: number; d: number; weekday: number } {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(date);
  if (!match) throw new Error(`Data inválida: ${date}`);
  const [y, m, d] = [Number(match[1]), Number(match[2]), Number(match[3])];
  return { y, m, d, weekday: new Date(Date.UTC(y, m - 1, d)).getUTCDay() };
}

/** "2026-10-28" -> "Quarta, 28 de outubro". */
export function formatLongDate(date: string): string {
  const { m, d, weekday } = parts(date);
  return `${WEEKDAYS[weekday]}, ${d} de ${MONTHS[m - 1]}`;
}

/** "2026-10-28" -> "Quarta, 28/10". */
export function formatShortDate(date: string): string {
  const { m, d, weekday } = parts(date);
  return `${WEEKDAYS[weekday]}, ${String(d).padStart(2, "0")}/${String(m).padStart(2, "0")}`;
}

/** "2026-10-28" -> "Qua". */
export function weekdayShort(date: string): string {
  return WEEKDAYS[parts(date).weekday].slice(0, 3);
}

export function dayOfMonth(date: string): number {
  return parts(date).d;
}

/** "2026-10-28" -> "out". */
export function monthShort(date: string): string {
  return MONTHS[parts(date).m - 1].slice(0, 3);
}

/** Horário "14:30" de um instante no fuso informado. */
export function formatTime(instant: Date, timeZone: string): string {
  return new Intl.DateTimeFormat("pt-BR", {
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
    timeZone,
  }).format(instant);
}

export type DayPeriod = "Manhã" | "Tarde" | "Noite";

/** Agrupamento dos horários da página pública. */
export function periodOf(hhmm: string): DayPeriod {
  const hour = Number(hhmm.slice(0, 2));
  if (hour < 12) return "Manhã";
  if (hour < 18) return "Tarde";
  return "Noite";
}

const capitalize = (text: string) => text.charAt(0).toUpperCase() + text.slice(1);

/**
 * Rótulo do mês (ou dos meses) de uma faixa de datas, acima da faixa de dias:
 * "Outubro 2026" ou, quando atravessa meses, "Outubro – Novembro" (com o ano
 * só na ponta quando o ano muda: "Dezembro 2026 – Janeiro 2027").
 */
export function formatMonthRange(first: string, last: string): string {
  const a = parts(first);
  const b = parts(last);
  if (a.y === b.y && a.m === b.m) return `${capitalize(MONTHS[a.m - 1])} ${a.y}`;
  if (a.y === b.y) return `${capitalize(MONTHS[a.m - 1])} – ${capitalize(MONTHS[b.m - 1])}`;
  return `${capitalize(MONTHS[a.m - 1])} ${a.y} – ${capitalize(MONTHS[b.m - 1])} ${b.y}`;
}

/**
 * Mês de um dia só, para o rótulo da faixa de dias: "Outubro". O ano aparece
 * apenas quando difere do ano de referência ("Janeiro 2027").
 */
export function formatMonthLabel(date: string, referenceDate?: string): string {
  const { y, m } = parts(date);
  const name = capitalize(MONTHS[m - 1]);
  return referenceDate && parts(referenceDate).y !== y ? `${name} ${y}` : name;
}
