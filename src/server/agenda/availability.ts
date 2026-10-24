import {
  addDaysToDate,
  diffDays,
  localDateOf,
  parseHm,
  weekdayOf,
  zonedInstant,
} from "./time";

/** Motor puro de disponibilidade: sem acesso ao banco, tudo no fuso do tenant. */

export type TimeRange = { start: string; end: string };
export type WeeklyHours = Record<0 | 1 | 2 | 3 | 4 | 5 | 6, TimeRange[]>;

export type AvailabilityInput = {
  /** "yyyy-MM-dd" no fuso do tenant. */
  date: string;
  timezone: string;
  now: Date;
  rules: { slotIntervalMin: number; minNoticeMin: number; maxDaysAhead: number };
  businessHours: WeeklyHours;
  professionals: Array<{ id: string; hours: WeeklyHours }>;
  blocks: Array<{ professionalId: string | null; startsAt: Date; endsAt: Date }>;
  busy: Array<{ professionalId: string; startsAt: Date; blockedUntil: Date }>;
  durationMin: number;
  bufferAfterMin: number;
};

export type Slot = {
  startsAt: Date;
  endsAt: Date;
  blockedUntil: Date;
  professionalIds: string[];
};

const MIN_MS = 60_000;

type Interval = [number, number]; // minutos desde 00:00 local

function toIntervals(ranges: TimeRange[]): Interval[] {
  return ranges
    .map((r): Interval => [parseHm(r.start), parseHm(r.end)])
    .filter(([s, e]) => e > s)
    .sort((a, b) => a[0] - b[0]);
}

function intersect(a: Interval[], b: Interval[]): Interval[] {
  const out: Interval[] = [];
  for (const [as, ae] of a) {
    for (const [bs, be] of b) {
      const s = Math.max(as, bs);
      const e = Math.min(ae, be);
      if (e > s) out.push([s, e]);
    }
  }
  return out.sort((x, y) => x[0] - y[0]);
}

/** Meio-aberto: [aS, aE) x [bS, bE). Extremos encostando não colidem. */
function overlaps(aS: number, aE: number, bS: number, bE: number): boolean {
  return aS < bE && bS < aE;
}

export function getAvailableSlots(input: AvailabilityInput): Slot[] {
  const { date, timezone, now, rules, durationMin, bufferAfterMin } = input;
  if (!(durationMin > 0)) throw new Error("durationMin deve ser maior que zero");
  if (!(rules.slotIntervalMin > 0)) throw new Error("slotIntervalMin deve ser maior que zero");
  if (bufferAfterMin < 0) throw new Error("bufferAfterMin não pode ser negativo");

  const today = localDateOf(now, timezone);
  const offset = diffDays(today, date);
  if (offset < 0 || offset > rules.maxDaysAhead) return [];

  const weekday = weekdayOf(date);
  const business = toIntervals(input.businessHours[weekday]);
  if (business.length === 0) return [];

  const totalMin = durationMin + bufferAfterMin;
  const earliest = now.getTime() + rules.minNoticeMin * MIN_MS;
  const byStart = new Map<number, Slot>();

  for (const pro of input.professionals) {
    const windows = intersect(business, toIntervals(pro.hours[weekday]));
    const proBusy = input.busy.filter((b) => b.professionalId === pro.id);
    const proBlocks = input.blocks.filter(
      (b) => b.professionalId === null || b.professionalId === pro.id,
    );

    for (const [winStart, winEnd] of windows) {
      for (let m = winStart; m + totalMin <= winEnd; m += rules.slotIntervalMin) {
        const start = zonedInstant(date, m, timezone).getTime();
        if (start < earliest) continue;
        const end = start + durationMin * MIN_MS;
        const blockedUntil = end + bufferAfterMin * MIN_MS;

        const clash =
          proBusy.some((b) => overlaps(start, blockedUntil, b.startsAt.getTime(), b.blockedUntil.getTime())) ||
          proBlocks.some((b) => overlaps(start, blockedUntil, b.startsAt.getTime(), b.endsAt.getTime()));
        if (clash) continue;

        const existing = byStart.get(start);
        if (existing) existing.professionalIds.push(pro.id);
        else
          byStart.set(start, {
            startsAt: new Date(start),
            endsAt: new Date(end),
            blockedUntil: new Date(blockedUntil),
            professionalIds: [pro.id],
          });
      }
    }
  }

  return [...byStart.values()].sort((a, b) => a.startsAt.getTime() - b.startsAt.getTime());
}

/** "Qualquer disponível": menor carga no dia; empate -> o primeiro da lista. */
export function pickProfessional(slot: Slot, loadByProfessional: Record<string, number>): string {
  if (slot.professionalIds.length === 0) throw new Error("Horário sem profissional disponível");
  let best = slot.professionalIds[0];
  let bestLoad = loadByProfessional[best] ?? 0;
  for (const id of slot.professionalIds.slice(1)) {
    const load = loadByProfessional[id] ?? 0;
    if (load < bestLoad) {
      best = id;
      bestLoad = load;
    }
  }
  return best;
}

/** Datas locais (yyyy-MM-dd) com ao menos um horário, em `days` dias a partir de `from`. */
export function getAvailableDates(
  input: Omit<AvailabilityInput, "date">,
  from: string,
  days: number,
): string[] {
  const out: string[] = [];
  for (let i = 0; i < days; i++) {
    const date = addDaysToDate(from, i);
    if (getAvailableSlots({ ...input, date }).length > 0) out.push(date);
  }
  return out;
}
