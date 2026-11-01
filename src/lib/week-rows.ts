import { WEEKDAY_ORDER, WEEKDAY_LABELS, type TimeRange, type WeeklyHours } from "./weekly-hours";

export type WeekRow = { label: string; text: string; closed: boolean };

const sameRanges = (a: TimeRange[], b: TimeRange[]) =>
  a.length === b.length && a.every((r, i) => r.start === b[i].start && r.end === b[i].end);

const rangesText = (ranges: TimeRange[]) =>
  ranges.length === 0 ? "Fechado" : ranges.map((r) => `${r.start} às ${r.end}`).join(", ");

const lower = (label: string) => label.charAt(0).toLowerCase() + label.slice(1);

/**
 * Linhas do bloco "Horário de atendimento": dias seguidos (segunda a domingo)
 * com o mesmo horário viram uma linha ("Segunda a sexta · 09:00 às 18:00");
 * dias fechados aparecem como "Fechado". Domingo e sábado sem horário em
 * sequência ficam juntos ("Sábado e domingo").
 */
export function weekRows(week: WeeklyHours): WeekRow[] {
  const groups: Array<{ days: number[]; ranges: TimeRange[] }> = [];
  for (const day of WEEKDAY_ORDER) {
    const ranges = [...week[day as keyof WeeklyHours]].sort((a, b) => a.start.localeCompare(b.start));
    const last = groups[groups.length - 1];
    if (last && sameRanges(last.ranges, ranges)) last.days.push(day);
    else groups.push({ days: [day], ranges });
  }
  return groups.map(({ days, ranges }) => {
    const first = WEEKDAY_LABELS[days[0]];
    const end = WEEKDAY_LABELS[days[days.length - 1]];
    const label =
      days.length === 1 ? first : days.length === 2 ? `${first} e ${lower(end)}` : `${first} a ${lower(end)}`;
    return { label, text: rangesText(ranges), closed: ranges.length === 0 };
  });
}
