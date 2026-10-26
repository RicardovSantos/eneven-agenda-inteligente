import { and, asc, eq, gt, inArray, isNull, lt, ne, or } from "drizzle-orm";
import {
  bookingServices,
  bookings,
  businessHours,
  customers,
  professionalHours,
  professionals,
  tenants,
  timeBlocks,
} from "@/db/schema";
import type { Db } from "@/db/types";
import { formatTime } from "@/lib/dates";
import type { BookingStatus } from "./bookings";
import { addDaysToDate, localDateOf, parseHm, weekdayOf, zonedInstant } from "./time";
import { withTenant } from "@/server/tenant-db";

/** Consultas de leitura da agenda do painel. Sempre dentro de `withTenant`. */

const MIN_MS = 60_000;
type Interval = [number, number];

export type MonthDay = {
  /** "yyyy-MM-dd" */
  date: string;
  /** Agendamentos não cancelados. */
  count: number;
  /** Minutos agendados ÷ minutos de expediente do dia, de 0 a 1. */
  occupancy: number;
  /** Estabelecimento sem horário de funcionamento nesse dia da semana. */
  closed: boolean;
};

export type PanelProfessional = {
  id: string;
  name: string;
  color: string | null;
  userId: string | null;
};

export type DayBooking = {
  kind: "booking";
  id: string;
  /** ISO 8601 (UTC). */
  startsAt: string;
  endsAt: string;
  /** "14:30" no fuso do estabelecimento. */
  time: string;
  endTime: string;
  status: BookingStatus;
  totalCents: number;
  notes: string | null;
  customer: { id: string; name: string; phone: string; visits: number };
  services: Array<{ name: string; durationMin: number; priceCents: number }>;
  professional: { id: string; name: string; color: string | null };
};

export type DayBlock = {
  kind: "block";
  id: string;
  startsAt: string;
  endsAt: string;
  time: string;
  endTime: string;
  professionalId: string | null;
  professionalName: string | null;
  reason: string | null;
};

export type DayItem = DayBooking | DayBlock;

export type DayAgenda = {
  date: string;
  timezone: string;
  items: DayItem[];
  /** Agendamentos não cancelados do dia. */
  count: number;
  /** Soma prevista (não cancelados), em centavos. */
  totalCents: number;
  /** Do primeiro horário de abertura ao último de fechamento do dia (minutos desde 00:00); `null` = fechado. */
  hours: { startMin: number; endMin: number } | null;
};

const hm = (t: string) => t.slice(0, 5);

function toIntervals(rows: Array<{ startsAt: string; endsAt: string }>): Interval[] {
  return rows
    .map((r): Interval => [parseHm(hm(r.startsAt)), parseHm(hm(r.endsAt))])
    .filter(([s, e]) => e > s)
    .sort((x, y) => x[0] - y[0]);
}

function merge(intervals: Interval[]): Interval[] {
  const out: Interval[] = [];
  for (const [s, e] of [...intervals].sort((x, y) => x[0] - y[0])) {
    const last = out[out.length - 1];
    if (last && s <= last[1]) last[1] = Math.max(last[1], e);
    else out.push([s, e]);
  }
  return out;
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
  return out;
}

const total = (intervals: Interval[]) => intervals.reduce((sum, [s, e]) => sum + (e - s), 0);

function monthDates(month: string): string[] {
  if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(month)) throw new Error(`Mês inválido: ${month}`);
  const dates: string[] = [];
  let date = `${month}-01`;
  while (date.startsWith(month)) {
    dates.push(date);
    date = addDaysToDate(date, 1);
  }
  return dates;
}

/**
 * Visão do mês: por dia, quantidade de agendamentos não cancelados e ocupação.
 *
 * Ocupação = minutos agendados (`startsAt`→`endsAt`, não cancelados) ÷ minutos
 * de trabalho do dia, limitada a 0–1. Minutos de trabalho = horário de
 * funcionamento ∩ união dos horários dos profissionais ativos (ou só o do
 * profissional filtrado). Dia fechado = sem horário de funcionamento no dia da
 * semana.
 */
export async function getMonthOverview(
  db: Db,
  tenantId: string,
  month: string,
  professionalId?: string,
): Promise<MonthDay[]> {
  const dates = monthDates(month);
  return withTenant(db, tenantId, async (tx) => {
    const [tenant] = await tx
      .select({ timezone: tenants.timezone })
      .from(tenants)
      .where(eq(tenants.id, tenantId))
      .limit(1);
    if (!tenant) throw new Error("Estabelecimento não encontrado");

    const business = await tx.select().from(businessHours).where(eq(businessHours.tenantId, tenantId));
    const pros = await tx
      .select({ id: professionals.id })
      .from(professionals)
      .where(
        and(
          eq(professionals.tenantId, tenantId),
          eq(professionals.active, true),
          professionalId ? eq(professionals.id, professionalId) : undefined,
        ),
      );
    const proIds = pros.map((p) => p.id);
    const proHours = proIds.length
      ? await tx
          .select()
          .from(professionalHours)
          .where(
            and(eq(professionalHours.tenantId, tenantId), inArray(professionalHours.professionalId, proIds)),
          )
      : [];

    // Minutos de trabalho por dia da semana.
    const workingByWeekday = new Map<number, number>();
    const closedWeekday = new Map<number, boolean>();
    for (let weekday = 0; weekday < 7; weekday++) {
      const biz = toIntervals(business.filter((h) => h.weekday === weekday));
      closedWeekday.set(weekday, biz.length === 0);
      const pro = merge(toIntervals(proHours.filter((h) => h.weekday === weekday)));
      workingByWeekday.set(weekday, total(intersect(merge(biz), pro)));
    }

    const from = zonedInstant(dates[0], 0, tenant.timezone);
    const to = zonedInstant(addDaysToDate(dates[dates.length - 1], 1), 0, tenant.timezone);
    const rows = await tx
      .select({ startsAt: bookings.startsAt, endsAt: bookings.endsAt })
      .from(bookings)
      .where(
        and(
          eq(bookings.tenantId, tenantId),
          ne(bookings.status, "canceled"),
          professionalId ? eq(bookings.professionalId, professionalId) : undefined,
          gt(bookings.startsAt, new Date(from.getTime() - 1)),
          lt(bookings.startsAt, to),
        ),
      );

    const count = new Map<string, number>();
    const booked = new Map<string, number>();
    for (const row of rows) {
      const date = localDateOf(row.startsAt, tenant.timezone);
      count.set(date, (count.get(date) ?? 0) + 1);
      booked.set(date, (booked.get(date) ?? 0) + (row.endsAt.getTime() - row.startsAt.getTime()) / MIN_MS);
    }

    return dates.map((date): MonthDay => {
      const weekday = weekdayOf(date);
      const working = workingByWeekday.get(weekday) ?? 0;
      const minutes = booked.get(date) ?? 0;
      const occupancy = working > 0 ? Math.min(1, Math.max(0, minutes / working)) : 0;
      return {
        date,
        count: count.get(date) ?? 0,
        occupancy,
        closed: closedWeekday.get(weekday) ?? true,
      };
    });
  });
}

/** Profissionais ativos (filtro e seleção). */
export async function listPanelProfessionals(db: Db, tenantId: string): Promise<PanelProfessional[]> {
  return withTenant(db, tenantId, (tx) =>
    tx
      .select({
        id: professionals.id,
        name: professionals.name,
        color: professionals.color,
        userId: professionals.userId,
      })
      .from(professionals)
      .where(and(eq(professionals.tenantId, tenantId), eq(professionals.active, true)))
      .orderBy(asc(professionals.sortOrder), asc(professionals.createdAt), asc(professionals.id)),
  );
}

/**
 * Agendamentos e bloqueios do dia, em ordem de horário. Cancelados aparecem na
 * lista (riscados) mas não entram em `count` nem em `totalCents`. Com
 * `professionalId`, só os dele e os bloqueios gerais ou dele.
 *
 * `customer.visits` é a ordem da visita: quantos agendamentos não cancelados
 * do cliente existem até o horário deste (inclusive).
 */
export async function getDayAgenda(
  db: Db,
  tenantId: string,
  date: string,
  professionalId?: string,
): Promise<DayAgenda> {
  return withTenant(db, tenantId, async (tx) => {
    const [tenant] = await tx
      .select({ timezone: tenants.timezone })
      .from(tenants)
      .where(eq(tenants.id, tenantId))
      .limit(1);
    if (!tenant) throw new Error("Estabelecimento não encontrado");
    const tz = tenant.timezone;
    const dayStart = zonedInstant(date, 0, tz);
    const dayEnd = zonedInstant(addDaysToDate(date, 1), 0, tz);

    const rows = await tx
      .select({
        id: bookings.id,
        startsAt: bookings.startsAt,
        endsAt: bookings.endsAt,
        status: bookings.status,
        totalCents: bookings.totalCents,
        notes: bookings.notes,
        customerId: customers.id,
        customerName: customers.name,
        customerPhone: customers.phone,
        professionalId: professionals.id,
        professionalName: professionals.name,
        professionalColor: professionals.color,
      })
      .from(bookings)
      .innerJoin(customers, eq(customers.id, bookings.customerId))
      .innerJoin(professionals, eq(professionals.id, bookings.professionalId))
      .where(
        and(
          eq(bookings.tenantId, tenantId),
          gt(bookings.startsAt, new Date(dayStart.getTime() - 1)),
          lt(bookings.startsAt, dayEnd),
          professionalId ? eq(bookings.professionalId, professionalId) : undefined,
        ),
      );

    const ids = rows.map((r) => r.id);
    const lines = ids.length
      ? await tx
          .select({
            bookingId: bookingServices.bookingId,
            name: bookingServices.name,
            durationMin: bookingServices.durationMin,
            priceCents: bookingServices.priceCents,
            position: bookingServices.position,
          })
          .from(bookingServices)
          .where(and(eq(bookingServices.tenantId, tenantId), inArray(bookingServices.bookingId, ids)))
          .orderBy(asc(bookingServices.position))
      : [];

    const customerIds = [...new Set(rows.map((r) => r.customerId))];
    const history = customerIds.length
      ? await tx
          .select({ customerId: bookings.customerId, startsAt: bookings.startsAt })
          .from(bookings)
          .where(
            and(
              eq(bookings.tenantId, tenantId),
              inArray(bookings.customerId, customerIds),
              ne(bookings.status, "canceled"),
            ),
          )
      : [];

    const blockRows = await tx
      .select({
        id: timeBlocks.id,
        professionalId: timeBlocks.professionalId,
        professionalName: professionals.name,
        startsAt: timeBlocks.startsAt,
        endsAt: timeBlocks.endsAt,
        reason: timeBlocks.reason,
      })
      .from(timeBlocks)
      .leftJoin(professionals, eq(professionals.id, timeBlocks.professionalId))
      .where(
        and(
          eq(timeBlocks.tenantId, tenantId),
          lt(timeBlocks.startsAt, dayEnd),
          gt(timeBlocks.endsAt, dayStart),
          professionalId
            ? or(isNull(timeBlocks.professionalId), eq(timeBlocks.professionalId, professionalId))
            : undefined,
        ),
      );

    const bookingItems = rows.map((r): DayBooking => ({
      kind: "booking",
      id: r.id,
      startsAt: r.startsAt.toISOString(),
      endsAt: r.endsAt.toISOString(),
      time: formatTime(r.startsAt, tz),
      endTime: formatTime(r.endsAt, tz),
      status: r.status,
      totalCents: r.totalCents,
      notes: r.notes,
      customer: {
        id: r.customerId,
        name: r.customerName,
        phone: r.customerPhone,
        visits: history.filter(
          (h) => h.customerId === r.customerId && h.startsAt.getTime() <= r.startsAt.getTime(),
        ).length,
      },
      services: lines
        .filter((l) => l.bookingId === r.id)
        .map((l) => ({ name: l.name, durationMin: l.durationMin, priceCents: l.priceCents })),
      professional: { id: r.professionalId, name: r.professionalName, color: r.professionalColor },
    }));

    const blockItems = blockRows.map((b): DayBlock => {
      const start = b.startsAt < dayStart ? dayStart : b.startsAt;
      const end = b.endsAt > dayEnd ? dayEnd : b.endsAt;
      return {
        kind: "block",
        id: b.id,
        startsAt: b.startsAt.toISOString(),
        endsAt: b.endsAt.toISOString(),
        time: formatTime(start, tz),
        endTime: end.getTime() === dayEnd.getTime() ? "24:00" : formatTime(end, tz),
        professionalId: b.professionalId,
        professionalName: b.professionalName,
        reason: b.reason,
      };
    });

    const startOf = (i: DayItem) => Math.max(new Date(i.startsAt).getTime(), dayStart.getTime());
    const items = [...bookingItems, ...blockItems].sort(
      (x, y) => startOf(x) - startOf(y) || (x.kind === y.kind ? 0 : x.kind === "booking" ? -1 : 1),
    );
    const active = bookingItems.filter((b) => b.status !== "canceled");
    const opening = toIntervals(
      (await tx.select().from(businessHours).where(eq(businessHours.tenantId, tenantId))).filter(
        (h) => h.weekday === weekdayOf(date),
      ),
    );
    return {
      hours: opening.length
        ? { startMin: Math.min(...opening.map((i) => i[0])), endMin: Math.max(...opening.map((i) => i[1])) }
        : null,
      date,
      timezone: tz,
      items,
      count: active.length,
      totalCents: active.reduce((sum, b) => sum + b.totalCents, 0),
    };
  });
}
