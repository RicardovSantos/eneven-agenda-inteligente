import { addDaysToDate, localDateOf, zonedInstant } from "@/server/agenda/time";

/** Instantes dos lembretes para um atendimento no fuso do estabelecimento. */
export function reminderTimes(startsAt: Date, timezone: string): { eve: Date; twoHours: Date } {
  if (!Number.isFinite(startsAt.getTime())) throw new Error("Data de agendamento inválida.");
  const day = localDateOf(startsAt, timezone);
  return {
    eve: zonedInstant(addDaysToDate(day, -1), 18 * 60, timezone),
    twoHours: new Date(startsAt.getTime() - 2 * 60 * 60 * 1000),
  };
}
