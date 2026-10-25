import { and, asc, eq } from "drizzle-orm";
import { bookingServices, bookings, customers, professionals } from "@/db/schema";
import type { Db } from "@/db/types";
import { formatTime } from "@/lib/dates";
import type { BookingStatus } from "@/server/agenda/bookings";
import { BookingError } from "@/server/agenda/errors";
import { localDateOf } from "@/server/agenda/time";
import { withTenant } from "@/server/tenant-db";

/** Agendamento como a cliente o vê (confirmação e página de gestão). */
export type BookingView = {
  bookingId: string;
  status: BookingStatus;
  /** Instantes em ISO 8601 (UTC). */
  startsAt: string;
  endsAt: string;
  /** Dia e hora locais do estabelecimento ("2030-01-07", "10:00"). */
  date: string;
  time: string;
  totalCents: number;
  durationMin: number;
  services: Array<{ name: string; durationMin: number; priceCents: number }>;
  professionalId: string;
  professionalName: string;
  customerName: string;
};

export async function getBookingView(
  db: Db,
  tenantId: string,
  bookingId: string,
  timezone: string,
): Promise<BookingView> {
  return withTenant(db, tenantId, async (tx) => {
    const [row] = await tx
      .select({
        id: bookings.id,
        status: bookings.status,
        startsAt: bookings.startsAt,
        endsAt: bookings.endsAt,
        totalCents: bookings.totalCents,
        professionalId: bookings.professionalId,
        professionalName: professionals.name,
        customerName: customers.name,
      })
      .from(bookings)
      .innerJoin(professionals, eq(professionals.id, bookings.professionalId))
      .innerJoin(customers, eq(customers.id, bookings.customerId))
      .where(and(eq(bookings.tenantId, tenantId), eq(bookings.id, bookingId)))
      .limit(1);
    if (!row) throw new BookingError("not_found");

    const lines = await tx
      .select({
        name: bookingServices.name,
        durationMin: bookingServices.durationMin,
        priceCents: bookingServices.priceCents,
      })
      .from(bookingServices)
      .where(and(eq(bookingServices.tenantId, tenantId), eq(bookingServices.bookingId, bookingId)))
      .orderBy(asc(bookingServices.position));

    return {
      bookingId: row.id,
      status: row.status,
      startsAt: row.startsAt.toISOString(),
      endsAt: row.endsAt.toISOString(),
      date: localDateOf(row.startsAt, timezone),
      time: formatTime(row.startsAt, timezone),
      totalCents: row.totalCents,
      durationMin: Math.round((row.endsAt.getTime() - row.startsAt.getTime()) / 60_000),
      services: lines,
      professionalId: row.professionalId,
      professionalName: row.professionalName,
      customerName: row.customerName,
    };
  });
}
