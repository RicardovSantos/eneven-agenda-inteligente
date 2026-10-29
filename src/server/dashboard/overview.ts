import { and, asc, desc, eq, gte, inArray, lt, sql } from "drizzle-orm";
import { bookingServices, bookings, professionals } from "@/db/schema";
import type { Db } from "@/db/types";
import { DAY_MS, addDaysToDate, diffDays, localDateOf, zonedInstant } from "@/server/agenda/time";
import { withTenant } from "@/server/tenant-db";

export type DashboardInput = {
  tenantId: string;
  /** "yyyy-MM" */
  month: string;
  timezone: string;
  now: Date;
};

export type Dashboard = {
  month: string;
  realizedCents: number;
  completedCount: number;
  averageTicketCents: number | null;
  previousRealizedCents: number;
  next30: { count: number; cents: number; until: string };
  /** Não cancelados no mês. */
  bookingsCount: number;
  previousBookingsCount: number;
  noShow: { count: number; base: number; rate: number | null };
  canceled: { count: number; rate: number | null };
  perDay: Array<{ date: string; count: number; past: boolean }>;
  topServices: Array<{ name: string; count: number; cents: number }>;
  perProfessional: Array<{
    id: string;
    name: string;
    color: string | null;
    completed: number;
    cents: number;
    noShows: number;
  }>;
};

const MONTH = /^(\d{4})-(\d{2})$/;

function parseMonth(month: string): { first: string; next: string; previous: string } {
  const m = MONTH.exec(month);
  if (!m || Number(m[2]) < 1 || Number(m[2]) > 12) throw new Error(`Mês inválido: ${month}`);
  const y = Number(m[1]);
  const mo = Number(m[2]);
  const iso = (year: number, monthIndex: number) =>
    new Date(Date.UTC(year, monthIndex, 1)).toISOString().slice(0, 10);
  return { first: `${month}-01`, next: iso(y, mo), previous: iso(y, mo - 2) };
}

export async function getDashboard(db: Db, input: DashboardInput): Promise<Dashboard> {
  const { tenantId, month, timezone, now } = input;
  const bounds = parseMonth(month);
  const start = zonedInstant(bounds.first, 0, timezone);
  const end = zonedInstant(bounds.next, 0, timezone);
  const prevStart = zonedInstant(bounds.previous, 0, timezone);
  const daysInMonth = diffDays(bounds.first, bounds.next);
  const horizon = new Date(now.getTime() + 30 * DAY_MS);
  const today = localDateOf(now, timezone);

  const localDay = sql<string>`to_char((${bookings.startsAt} at time zone ${timezone}::text)::date, 'YYYY-MM-DD')`;
  const isCurrent = sql<boolean>`${bookings.startsAt} >= ${start.toISOString()}::timestamptz`;
  const completedCents = sql`coalesce(sum(${bookings.totalCents}) filter (where ${bookings.status} = 'completed'), 0)`;

  const data = await withTenant(db, tenantId, async (tx) => {
    const byStatus = await tx
      .select({
        isCurrent,
        status: bookings.status,
        count: sql<number>`count(*)::int`,
        cents: sql<number>`coalesce(sum(${bookings.totalCents}), 0)::int`,
      })
      .from(bookings)
      .where(and(gte(bookings.startsAt, prevStart), lt(bookings.startsAt, end)))
      .groupBy(sql`1`, sql`2`);

    const days = await tx
      .select({ date: localDay, count: sql<number>`count(*)::int` })
      .from(bookings)
      .where(
        and(
          gte(bookings.startsAt, start),
          lt(bookings.startsAt, end),
          sql`${bookings.status} <> 'canceled'`,
        ),
      )
      .groupBy(sql`1`);

    const [next30] = await tx
      .select({
        count: sql<number>`count(*)::int`,
        cents: sql<number>`coalesce(sum(${bookings.totalCents}), 0)::int`,
      })
      .from(bookings)
      .where(
        and(
          inArray(bookings.status, ["scheduled", "confirmed"]),
          gte(bookings.startsAt, now),
          lt(bookings.startsAt, horizon),
        ),
      );

    const services = await tx
      .select({
        name: bookingServices.name,
        count: sql<number>`count(*)::int`,
        cents: sql<number>`coalesce(sum(${bookingServices.priceCents}), 0)::int`,
      })
      .from(bookingServices)
      .innerJoin(bookings, eq(bookings.id, bookingServices.bookingId))
      .where(
        and(
          eq(bookings.status, "completed"),
          gte(bookings.startsAt, start),
          lt(bookings.startsAt, end),
        ),
      )
      .groupBy(bookingServices.name)
      .orderBy(desc(sql`count(*)`), asc(bookingServices.name))
      .limit(5);

    const pros = await tx
      .select({
        id: professionals.id,
        name: professionals.name,
        color: professionals.color,
        completed: sql<number>`count(*) filter (where ${bookings.status} = 'completed')::int`,
        cents: sql<number>`${completedCents}::int`,
        noShows: sql<number>`count(*) filter (where ${bookings.status} = 'no_show')::int`,
      })
      .from(bookings)
      .innerJoin(professionals, eq(professionals.id, bookings.professionalId))
      .where(
        and(
          inArray(bookings.status, ["completed", "no_show"]),
          gte(bookings.startsAt, start),
          lt(bookings.startsAt, end),
        ),
      )
      .groupBy(professionals.id, professionals.name, professionals.color)
      .orderBy(desc(completedCents), asc(professionals.name));

    return { byStatus, days, next30, services, pros };
  });

  const cell = (current: boolean, status: string) =>
    data.byStatus.find((r) => Boolean(r.isCurrent) === current && r.status === status) ?? {
      count: 0,
      cents: 0,
    };
  const nonCanceled = (current: boolean) =>
    (["scheduled", "confirmed", "completed", "no_show"] as const).reduce(
      (sum, s) => sum + cell(current, s).count,
      0,
    );

  const completed = cell(true, "completed");
  const noShowCount = cell(true, "no_show").count;
  const canceledCount = cell(true, "canceled").count;
  const noShowBase = completed.count + noShowCount;
  const allInMonth = nonCanceled(true) + canceledCount;

  const countByDay = new Map(data.days.map((d) => [d.date, d.count]));
  const perDay = Array.from({ length: daysInMonth }, (_, i) => {
    const date = addDaysToDate(bounds.first, i);
    return { date, count: countByDay.get(date) ?? 0, past: date <= today };
  });

  return {
    month,
    realizedCents: completed.cents,
    completedCount: completed.count,
    averageTicketCents: completed.count > 0 ? Math.round(completed.cents / completed.count) : null,
    previousRealizedCents: cell(false, "completed").cents,
    next30: {
      count: data.next30?.count ?? 0,
      cents: data.next30?.cents ?? 0,
      until: localDateOf(horizon, timezone),
    },
    bookingsCount: nonCanceled(true),
    previousBookingsCount: nonCanceled(false),
    noShow: {
      count: noShowCount,
      base: noShowBase,
      rate: noShowBase > 0 ? noShowCount / noShowBase : null,
    },
    canceled: {
      count: canceledCount,
      rate: allInMonth > 0 ? canceledCount / allInMonth : null,
    },
    perDay,
    topServices: data.services,
    perProfessional: data.pros,
  };
}
