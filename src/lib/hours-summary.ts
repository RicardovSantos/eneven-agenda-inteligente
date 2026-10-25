import { WEEKDAY_ORDER, type TimeRange, type WeeklyHours } from "./weekly-hours";

const SHORT_DAY: Record<number, string> = {
  0: "Dom",
  1: "Seg",
  2: "Ter",
  3: "Qua",
  4: "Qui",
  5: "Sex",
  6: "Sáb",
};

/** "09:00" -> "9h"; "09:30" -> "9h30". */
function shortTime(hm: string): string {
  const [h, m] = hm.split(":");
  return m === "00" ? `${Number(h)}h` : `${Number(h)}h${m}`;
}

const rangesKey = (ranges: TimeRange[]) => ranges.map((r) => `${r.start}-${r.end}`).join(",");
const rangesText = (ranges: TimeRange[]) =>
  ranges.map((r) => `${shortTime(r.start)}–${shortTime(r.end)}`).join(", ");

/**
 * Resumo do expediente para a tabela: dias seguidos (segunda a domingo) com o
 * mesmo horário viram "Seg a Sex 9h–18h"; grupos separados por " · ".
 */
export function summarizeWeek(hours: WeeklyHours): string {
  const groups: Array<{ days: number[]; ranges: TimeRange[] }> = [];
  for (const day of WEEKDAY_ORDER) {
    const ranges = hours[day];
    if (ranges.length === 0) continue;
    const last = groups[groups.length - 1];
    const previous = last ? last.days[last.days.length - 1] : undefined;
    const adjacent =
      previous !== undefined &&
      WEEKDAY_ORDER.indexOf(day) === WEEKDAY_ORDER.indexOf(previous as never) + 1;
    if (last && adjacent && rangesKey(last.ranges) === rangesKey(ranges)) last.days.push(day);
    else groups.push({ days: [day], ranges });
  }
  if (groups.length === 0) return "Sem horário";
  return groups
    .map(({ days, ranges }) => {
      const first = SHORT_DAY[days[0]];
      const label =
        days.length === 1
          ? first
          : days.length === 2
            ? `${first} e ${SHORT_DAY[days[1]]}`
            : `${first} a ${SHORT_DAY[days[days.length - 1]]}`;
      return `${label} ${rangesText(ranges)}`;
    })
    .join(" · ");
}
