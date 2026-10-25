import { and, eq, gt, inArray, isNull, lt, ne, or } from "drizzle-orm";
import {
  bookings,
  businessHours,
  professionalHours,
  professionalServices,
  professionals,
  services,
  tenants,
  timeBlocks,
} from "@/db/schema";
import type { Db } from "@/db/types";
import type { AvailabilityInput, TimeRange, WeeklyHours } from "./availability";
import { addDaysToDate, zonedInstant } from "./time";

export type LoadOptions = {
  /** "yyyy-MM-dd" no fuso do tenant. */
  date: string;
  serviceIds: string[];
  professionalId?: string;
  now?: Date;
  /** Ignora este agendamento ao calcular ocupação (remarcação). */
  excludeBookingId?: string;
  /** Duração/buffer já conhecidos (remarcação); dispensa `serviceIds`. */
  override?: { durationMin: number; bufferAfterMin: number };
};

function emptyWeek(): WeeklyHours {
  return { 0: [], 1: [], 2: [], 3: [], 4: [], 5: [], 6: [] };
}

const hm = (t: string) => t.slice(0, 5); // "HH:MM:SS" -> "HH:MM"

function addRange(week: WeeklyHours, weekday: number, start: string, end: string) {
  (week[weekday as keyof WeeklyHours] as TimeRange[]).push({ start: hm(start), end: hm(end) });
}

/**
 * Monta a entrada do motor de disponibilidade a partir do banco. `tx` deve ser
 * a transação de `withTenant` (RLS filtra tudo pelo tenant; `tenantId` aqui só
 * é necessário para ler `tenants`, que não tem RLS, e como filtro explícito).
 */
export async function loadAvailabilityContext(
  tx: Db,
  tenantId: string,
  opts: LoadOptions,
): Promise<AvailabilityInput> {
  const [tenant] = await tx.select().from(tenants).where(eq(tenants.id, tenantId)).limit(1);
  if (!tenant) throw new Error("Estabelecimento não encontrado");

  let durationMin = 0;
  let bufferAfterMin = 0;
  if (opts.override) {
    ({ durationMin, bufferAfterMin } = opts.override);
  } else {
    const rows = await tx
      .select()
      .from(services)
      .where(
        and(
          eq(services.tenantId, tenantId),
          inArray(services.id, opts.serviceIds),
          isNull(services.archivedAt),
        ),
      );
    if (rows.length === 0) throw new Error("Nenhum serviço encontrado");
    durationMin = rows.reduce((s, r) => s + r.durationMin, 0);
    bufferAfterMin = Math.max(...rows.map((r) => r.bufferAfterMin));
  }

  // Profissionais ativos que fazem todos os serviços.
  let pros = await tx
    .select({ id: professionals.id })
    .from(professionals)
    .where(
      and(
        eq(professionals.tenantId, tenantId),
        eq(professionals.active, true),
        opts.professionalId ? eq(professionals.id, opts.professionalId) : undefined,
      ),
    )
    .orderBy(professionals.sortOrder, professionals.createdAt, professionals.id);

  if (!opts.override && opts.serviceIds.length > 0 && pros.length > 0) {
    const links = await tx
      .select()
      .from(professionalServices)
      .where(
        and(
          eq(professionalServices.tenantId, tenantId),
          inArray(professionalServices.serviceId, opts.serviceIds),
        ),
      );
    const wanted = new Set(opts.serviceIds).size;
    const count = new Map<string, number>();
    for (const l of links) count.set(l.professionalId, (count.get(l.professionalId) ?? 0) + 1);
    pros = pros.filter((p) => (count.get(p.id) ?? 0) >= wanted);
  }

  const business = emptyWeek();
  for (const h of await tx.select().from(businessHours).where(eq(businessHours.tenantId, tenantId))) {
    addRange(business, h.weekday, h.startsAt, h.endsAt);
  }

  const proIds = pros.map((p) => p.id);
  const proWeeks = new Map<string, WeeklyHours>(proIds.map((id) => [id, emptyWeek()]));
  if (proIds.length > 0) {
    const hours = await tx
      .select()
      .from(professionalHours)
      .where(
        and(eq(professionalHours.tenantId, tenantId), inArray(professionalHours.professionalId, proIds)),
      );
    for (const h of hours) addRange(proWeeks.get(h.professionalId)!, h.weekday, h.startsAt, h.endsAt);
  }

  // Janela do dia com folga de um dia para cada lado (atendimentos e buffers
  // que atravessam a meia-noite).
  const from = zonedInstant(addDaysToDate(opts.date, -1), 0, tenant.timezone);
  const to = zonedInstant(addDaysToDate(opts.date, 2), 0, tenant.timezone);

  const busyRows =
    proIds.length === 0
      ? []
      : await tx
          .select({
            professionalId: bookings.professionalId,
            startsAt: bookings.startsAt,
            blockedUntil: bookings.blockedUntil,
          })
          .from(bookings)
          .where(
            and(
              eq(bookings.tenantId, tenantId),
              inArray(bookings.professionalId, proIds),
              ne(bookings.status, "canceled"),
              lt(bookings.startsAt, to),
              gt(bookings.blockedUntil, from),
              opts.excludeBookingId ? ne(bookings.id, opts.excludeBookingId) : undefined,
            ),
          );

  const blockRows = await tx
    .select({
      professionalId: timeBlocks.professionalId,
      startsAt: timeBlocks.startsAt,
      endsAt: timeBlocks.endsAt,
    })
    .from(timeBlocks)
    .where(
      and(
        eq(timeBlocks.tenantId, tenantId),
        lt(timeBlocks.startsAt, to),
        gt(timeBlocks.endsAt, from),
        or(
          isNull(timeBlocks.professionalId),
          proIds.length ? inArray(timeBlocks.professionalId, proIds) : undefined,
        ),
      ),
    );

  return {
    date: opts.date,
    timezone: tenant.timezone,
    now: opts.now ?? new Date(),
    rules: {
      slotIntervalMin: tenant.slotIntervalMin,
      minNoticeMin: tenant.minNoticeMin,
      maxDaysAhead: tenant.maxDaysAhead,
    },
    businessHours: business,
    professionals: pros.map((p) => ({ id: p.id, hours: proWeeks.get(p.id)! })),
    blocks: blockRows,
    busy: busyRows,
    durationMin,
    bufferAfterMin,
  };
}
