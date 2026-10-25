import { and, eq, inArray, isNull } from "drizzle-orm";
import { services, tenants } from "@/db/schema";
import type { Db } from "@/db/types";
import { formatTime } from "@/lib/dates";
import { getAvailableDates, getAvailableSlots } from "@/server/agenda/availability";
import { BookingError } from "@/server/agenda/errors";
import { loadAvailabilityContext } from "@/server/agenda/load";
import { diffDays, localDateOf } from "@/server/agenda/time";
import { withTenant } from "@/server/tenant-db";
import type { DatesInput, SlotsInput } from "./schemas";

export type PublicSlot = {
  /** Instante de início (ISO 8601, UTC). */
  startsAt: string;
  /** "14:30" no fuso do estabelecimento. */
  time: string;
};

/**
 * Só serviços visíveis e não arquivados do próprio estabelecimento podem ser
 * reservados online. Qualquer outro id (de outro tenant, oculto, arquivado)
 * é uma seleção inválida.
 */
async function bookableServiceIds(db: Db, tenantId: string, serviceIds: string[]) {
  const ids = [...new Set(serviceIds)];
  const rows = await withTenant(db, tenantId, (tx) =>
    tx
      .select({ id: services.id })
      .from(services)
      .where(
        and(
          eq(services.tenantId, tenantId),
          inArray(services.id, ids),
          eq(services.visible, true),
          isNull(services.archivedAt),
        ),
      ),
  );
  if (rows.length !== ids.length) throw new BookingError("invalid_selection");
  return ids;
}

/** Horários livres do dia para os serviços escolhidos (e profissional, ou "any"). */
export async function listPublicSlots(
  db: Db,
  tenantId: string,
  input: SlotsInput,
  now: Date = new Date(),
): Promise<PublicSlot[]> {
  const serviceIds = await bookableServiceIds(db, tenantId, input.serviceIds);
  const ctx = await withTenant(db, tenantId, (tx) =>
    loadAvailabilityContext(tx, tenantId, {
      date: input.date,
      serviceIds,
      professionalId: input.professionalId === "any" ? undefined : input.professionalId,
      now,
    }),
  );
  if (ctx.professionals.length === 0) return [];
  return getAvailableSlots(ctx).map((slot) => ({
    startsAt: slot.startsAt.toISOString(),
    time: formatTime(slot.startsAt, ctx.timezone),
  }));
}

/**
 * Datas ("yyyy-MM-dd") com ao menos um horário, de `from` (nunca antes de hoje
 * no fuso do salão) até o prazo máximo de agendamento.
 */
export async function listPublicDates(
  db: Db,
  tenantId: string,
  input: DatesInput,
  now: Date = new Date(),
): Promise<string[]> {
  const serviceIds = await bookableServiceIds(db, tenantId, input.serviceIds);
  const [tenant] = await db
    .select({ timezone: tenants.timezone, maxDaysAhead: tenants.maxDaysAhead })
    .from(tenants)
    .where(eq(tenants.id, tenantId))
    .limit(1);
  if (!tenant) throw new BookingError("not_found");

  const today = localDateOf(now, tenant.timezone);
  // yyyy-MM-dd compara certo como texto.
  const from = input.from > today ? input.from : today;
  const days = tenant.maxDaysAhead - diffDays(today, from) + 1;
  if (days <= 0) return [];

  const ctx = await withTenant(db, tenantId, (tx) =>
    loadAvailabilityContext(tx, tenantId, {
      date: from,
      serviceIds,
      professionalId: input.professionalId === "any" ? undefined : input.professionalId,
      now,
      spanDays: days,
    }),
  );
  if (ctx.professionals.length === 0) return [];
  return getAvailableDates(ctx, from, days);
}
