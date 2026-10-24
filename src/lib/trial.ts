const DAY_MS = 24 * 60 * 60 * 1000;

/** Dias que faltam para o fim do teste (dia parcial conta como inteiro; mínimo 0). */
export function trialDaysLeft(trialEndsAt: Date, now: Date = new Date()): number {
  return Math.max(0, Math.ceil((trialEndsAt.getTime() - now.getTime()) / DAY_MS));
}

/** `dd/mm` no fuso do estabelecimento. */
export function formatDayMonth(date: Date, timeZone: string): string {
  return new Intl.DateTimeFormat("pt-BR", {
    day: "2-digit",
    month: "2-digit",
    timeZone,
  }).format(date);
}
