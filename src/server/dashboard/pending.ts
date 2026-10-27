import { and, asc, eq, gte, inArray, lt } from "drizzle-orm";
import { bookingServices, bookings, customers, professionals } from "@/db/schema";
import type { Db } from "@/db/types";
import { DAY_MS } from "@/server/agenda/time";
import { withTenant } from "@/server/tenant-db";

export type PendingOutcome = {
  bookingId: string;
  startsAt: Date;
  customerName: string;
  services: string[];
  professionalName: string;
};

const WINDOW_DAYS = 90;
const LIMIT = 50;

/** Agendamentos já encerrados que ainda estão como agendado/confirmado (falta registrar o desfecho). */
export async function listPendingOutcomes(
  db: Db,
  tenantId: string,
  now: Date,
): Promise<PendingOutcome[]> {
  return withTenant(db, tenantId, async (tx) => {
    const rows = await tx
      .select({
        bookingId: bookings.id,
        startsAt: bookings.startsAt,
        customerName: customers.name,
        professionalName: professionals.name,
      })
      .from(bookings)
      .innerJoin(customers, eq(customers.id, bookings.customerId))
      .innerJoin(professionals, eq(professionals.id, bookings.professionalId))
      .where(
        and(
          inArray(bookings.status, ["scheduled", "confirmed"]),
          lt(bookings.endsAt, now),
          gte(bookings.startsAt, new Date(now.getTime() - WINDOW_DAYS * DAY_MS)),
        ),
      )
      .orderBy(asc(bookings.startsAt), asc(bookings.id))
      .limit(LIMIT);
    if (rows.length === 0) return [];

    const items = await tx
      .select({ bookingId: bookingServices.bookingId, name: bookingServices.name })
      .from(bookingServices)
      .where(
        inArray(
          bookingServices.bookingId,
          rows.map((r) => r.bookingId),
        ),
      )
      .orderBy(asc(bookingServices.position));
    const byBooking = new Map<string, string[]>();
    for (const i of items) {
      byBooking.set(i.bookingId, [...(byBooking.get(i.bookingId) ?? []), i.name]);
    }
    return rows.map((r) => ({ ...r, services: byBooking.get(r.bookingId) ?? [] }));
  });
}
