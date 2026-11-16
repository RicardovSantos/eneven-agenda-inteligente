import { asc, eq } from "drizzle-orm";
import { bookingServices, bookings, customers, tenants } from "@/db/schema";
import type { Db } from "@/db/types";
import { withTenant } from "@/server/tenant-db";

export type PushType = "booking_created" | "booking_canceled" | "booking_rescheduled";
/** Texto da notificação: título curto e uma linha com cliente, serviço e horário. */
export type PushContent = { title: string; body: string };

const TITLES: Record<PushType, string> = {
  booking_created: "Novo agendamento",
  booking_canceled: "Agendamento cancelado",
  booking_rescheduled: "Agendamento remarcado",
};

const clip = (text: string, max: number) => (text.length > max ? `${text.slice(0, max - 1).trimEnd()}…` : text);

/** "ter, 17/11 às 10:30" no fuso do estabelecimento. */
export function formatPushWhen(instant: Date, timezone: string): string {
  const parts = new Intl.DateTimeFormat("pt-BR", {
    weekday: "short",
    day: "2-digit",
    month: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
    timeZone: timezone,
  }).formatToParts(instant);
  const get = (type: string) => parts.find((p) => p.type === type)?.value ?? "";
  return `${get("weekday").replace(".", "")}, ${get("day")}/${get("month")} às ${get("hour")}:${get("minute")}`;
}

/** Monta o texto a partir dos dados já lidos (puro, para testar). */
export function buildPushContent(
  type: PushType,
  booking: { customerName: string; services: string[]; startsAt: Date; timezone: string },
): PushContent {
  const name = clip(booking.customerName.trim().replace(/\s+/g, " "), 40) || "Cliente";
  const services = clip(booking.services.join(" + "), 60);
  const when = formatPushWhen(booking.startsAt, booking.timezone);
  return { title: TITLES[type], body: [name, services, when].filter(Boolean).join(" · ") };
}

/**
 * Lê o agendamento e devolve o texto da notificação. `null` se ele não existe mais
 * (o aparelho então mostra o aviso genérico).
 */
export async function pushContentFor(db: Db, tenantId: string, bookingId: string, type: PushType): Promise<PushContent | null> {
  return withTenant(db, tenantId, async (tx) => {
    const [row] = await tx
      .select({ startsAt: bookings.startsAt, customerName: customers.name, timezone: tenants.timezone })
      .from(bookings)
      .innerJoin(customers, eq(customers.id, bookings.customerId))
      .innerJoin(tenants, eq(tenants.id, bookings.tenantId))
      .where(eq(bookings.id, bookingId))
      .limit(1);
    if (!row) return null;
    const lines = await tx
      .select({ name: bookingServices.name })
      .from(bookingServices)
      .where(eq(bookingServices.bookingId, bookingId))
      .orderBy(asc(bookingServices.position));
    return buildPushContent(type, { customerName: row.customerName, services: lines.map((l) => l.name), startsAt: row.startsAt, timezone: row.timezone });
  });
}
