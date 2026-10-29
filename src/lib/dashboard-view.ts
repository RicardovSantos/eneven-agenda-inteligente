import { formatBRL } from "./format";

/** Funções puras da visão geral (mês, comparações e formatos); sem imports de servidor. */

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
const SHORT = ["jan.", "fev.", "mar.", "abr.", "mai.", "jun.", "jul.", "ago.", "set.", "out.", "nov.", "dez."];

const MONTH = /^(\d{4})-(0[1-9]|1[0-2])$/;

/** `?mes=yyyy-MM`: valor inválido (ou repetido) volta para `fallback` (o mês atual do salão). */
export function parseMonthParam(raw: string | string[] | undefined, fallback: string): string {
  return typeof raw === "string" && MONTH.test(raw) ? raw : fallback;
}

export function shiftMonth(month: string, delta: number): string {
  const m = MONTH.exec(month);
  if (!m) throw new Error(`Mês inválido: ${month}`);
  const index = Number(m[1]) * 12 + (Number(m[2]) - 1) + delta;
  return `${Math.floor(index / 12)}-${String((index % 12) + 1).padStart(2, "0")}`;
}

function monthIndex(month: string): number {
  const m = MONTH.exec(month);
  if (!m) throw new Error(`Mês inválido: ${month}`);
  return Number(m[2]) - 1;
}

/** "2026-10" -> "outubro". */
export function monthName(month: string): string {
  return MONTHS[monthIndex(month)];
}

/** "2026-10" -> "out.". */
export function monthShortName(month: string): string {
  return SHORT[monthIndex(month)];
}

/** "2026-10" -> "Outubro de 2026". */
export function monthLabel(month: string): string {
  const name = monthName(month);
  return `${name[0].toUpperCase()}${name.slice(1)} de ${month.slice(0, 4)}`;
}

/** "2026-11-26" -> "26 de novembro". */
export function dayAndMonth(date: string): string {
  const [, m, d] = date.split("-").map(Number);
  return `${d} de ${MONTHS[m - 1]}`;
}

export type Comparison = { direction: "up" | "down" | "same"; percent: number };

/** Faturamento contra o mês anterior; `null` quando o mês anterior não faturou (nada a comparar). */
export function compareRealized(current: number, previous: number): Comparison | null {
  if (previous <= 0) return null;
  const percent = Math.round((Math.abs(current - previous) / previous) * 100);
  if (current === previous) return { direction: "same", percent: 0 };
  return { direction: current > previous ? "up" : "down", percent };
}

const PERCENT = new Intl.NumberFormat("pt-BR", { style: "percent", maximumFractionDigits: 1 });

/** 0.0345 -> "3,4%"; sem base de cálculo -> "—". */
export function formatPercent(rate: number | null): string {
  return rate === null ? "—" : PERCENT.format(rate);
}

/** "R$ 7.420" quando redondo (celular); com centavos quando não. */
export function formatBRLShort(cents: number): string {
  return cents % 100 === 0 ? formatBRL(cents).replace(/,00$/, "") : formatBRL(cents);
}

export function plural(count: number, one: string, many: string): string {
  return `${count} ${count === 1 ? one : many}`;
}
