import { and, eq } from "drizzle-orm";
import { bookings, tenants } from "@/db/schema";
import type { Db } from "@/db/types";
import { formatTime } from "@/lib/dates";
import { getAvailableDates, getAvailableSlots } from "@/server/agenda/availability";
import { cancelBooking, findBookingByManageToken, rescheduleBooking } from "@/server/agenda/bookings";
import { BookingError } from "@/server/agenda/errors";
import { loadAvailabilityContext } from "@/server/agenda/load";
import { diffDays, localDateOf } from "@/server/agenda/time";
import { withTenant } from "@/server/tenant-db";
import type { PublicSlot } from "./slots";
import { getPublicTenant, toPublicTenant, type PublicTenant } from "./tenant";
import { getBookingView, type BookingView } from "./view";

const MIN_MS = 60_000;
const MAX_TOKEN_LENGTH = 100;

export type ManageView = {
  tenant: PublicTenant;
  booking: BookingView;
  /** Ainda dá para remarcar ou cancelar sozinha (status e prazo do salão). */
  canChange: boolean;
  /** `canChange` e o estabelecimento pode receber agendamentos (remarcar ocupa um horário novo). */
  canReschedule: boolean;
};

/** Localiza o agendamento pelo token e o estabelecimento dono dele (o tenant vem do banco, nunca do cliente). */
async function resolveToken(db: Db, token: string) {
  if (typeof token !== "string" || token === "" || token.length > MAX_TOKEN_LENGTH) return null;
  const found = await findBookingByManageToken(db, token);
  if (!found) return null;
  const [tenant] = await db.select().from(tenants).where(eq(tenants.id, found.tenantId)).limit(1);
  return tenant ? { ...found, tenant } : null;
}

/** Remarcar exige que o estabelecimento possa agendar (e-mail, plano e serviços em dia); cancelar não. */
async function tenantCanBook(db: Db, slug: string, now: Date): Promise<boolean> {
  return (await getPublicTenant(slug, { db, now }))?.canBook ?? false;
}

function allowsChange(
  booking: { status: string; startsAt: string },
  cancelWindowMin: number,
  now: Date,
): boolean {
  return (
    (booking.status === "scheduled" || booking.status === "confirmed") &&
    new Date(booking.startsAt).getTime() - now.getTime() >= cancelWindowMin * MIN_MS
  );
}

export async function getManageView(
  db: Db,
  token: string,
  now: Date = new Date(),
): Promise<ManageView | null> {
  const resolved = await resolveToken(db, token);
  if (!resolved) return null;
  const booking = await getBookingView(db, resolved.tenantId, resolved.bookingId, resolved.tenant.timezone);
  const canChange = allowsChange(booking, resolved.tenant.cancelWindowMin, now);
  return {
    tenant: toPublicTenant(resolved.tenant),
    booking,
    canChange,
    canReschedule: canChange && (await tenantCanBook(db, resolved.tenant.slug, now)),
  };
}

/** Cancela como cliente (respeita o prazo do salão). Lança `BookingError`. */
export async function cancelByToken(db: Db, token: string, now: Date = new Date()): Promise<void> {
  const resolved = await resolveToken(db, token);
  if (!resolved) throw new BookingError("not_found");
  await cancelBooking(db, resolved.tenantId, resolved.bookingId, "customer", now);
}

/** Remarca como cliente, mantendo serviços e profissional. Lança `BookingError`. */
export async function rescheduleByToken(
  db: Db,
  token: string,
  startsAtIso: string,
  now: Date = new Date(),
): Promise<void> {
  const resolved = await resolveToken(db, token);
  if (!resolved) throw new BookingError("not_found");
  if (!(await tenantCanBook(db, resolved.tenant.slug, now))) {
    throw new BookingError("reschedule_unavailable", `Para remarcar, fale com ${resolved.tenant.name}.`);
  }
  await rescheduleBooking(
    db,
    resolved.tenantId,
    resolved.bookingId,
    new Date(startsAtIso),
    "customer",
    now,
  );
}

/**
 * Contexto de disponibilidade para remarcar: mesma duração e profissional do
 * agendamento, sem contar o próprio horário como ocupado. `null` quando o
 * agendamento não pode mais ser remarcado pela cliente.
 */
async function rescheduleContext(
  db: Db,
  token: string,
  date: string,
  now: Date,
  spanDays?: number,
) {
  const resolved = await resolveToken(db, token);
  if (!resolved) return null;
  const { tenantId, bookingId, tenant } = resolved;
  if (!(await tenantCanBook(db, tenant.slug, now))) return null;

  return withTenant(db, tenantId, async (tx) => {
    const [booking] = await tx
      .select()
      .from(bookings)
      .where(and(eq(bookings.tenantId, tenantId), eq(bookings.id, bookingId)))
      .limit(1);
    if (!booking) return null;
    const view = { status: booking.status, startsAt: booking.startsAt.toISOString() };
    if (!allowsChange(view, tenant.cancelWindowMin, now)) return null;

    return loadAvailabilityContext(tx, tenantId, {
      date,
      serviceIds: [],
      professionalId: booking.professionalId,
      now,
      excludeBookingId: bookingId,
      spanDays,
      override: {
        durationMin: (booking.endsAt.getTime() - booking.startsAt.getTime()) / MIN_MS,
        bufferAfterMin: (booking.blockedUntil.getTime() - booking.endsAt.getTime()) / MIN_MS,
      },
    });
  });
}

export async function listRescheduleSlots(
  db: Db,
  token: string,
  date: string,
  now: Date = new Date(),
): Promise<PublicSlot[]> {
  const ctx = await rescheduleContext(db, token, date, now);
  if (!ctx || ctx.professionals.length === 0) return [];
  return getAvailableSlots(ctx).map((slot) => ({
    startsAt: slot.startsAt.toISOString(),
    time: formatTime(slot.startsAt, ctx.timezone),
  }));
}

export async function listRescheduleDates(
  db: Db,
  token: string,
  from: string,
  now: Date = new Date(),
): Promise<string[]> {
  const resolved = await resolveToken(db, token);
  if (!resolved) return [];
  const { timezone, maxDaysAhead } = resolved.tenant;
  const today = localDateOf(now, timezone);
  const start = from > today ? from : today;
  const days = maxDaysAhead - diffDays(today, start) + 1;
  if (days <= 0) return [];

  const ctx = await rescheduleContext(db, token, start, now, days);
  if (!ctx || ctx.professionals.length === 0) return [];
  return getAvailableDates(ctx, start, days);
}
