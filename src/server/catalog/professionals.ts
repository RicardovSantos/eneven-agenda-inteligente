import { and, count, eq, gt, inArray, isNull, max, ne, sql } from "drizzle-orm";
import {
  bookings,
  businessHours,
  professionalHours,
  professionalServices,
  professionals,
  plans,
  services,
  tenants,
} from "@/db/schema";
import type { Db } from "@/db/types";
import { isProfessionalColor } from "@/lib/professional-colors";
import {
  OUTSIDE_BUSINESS_HOURS_MESSAGE,
  WEEKDAYS,
  emptyWeek,
  outsideBusinessHours,
  validateWeeklyHours,
  type WeeklyHours,
} from "@/lib/weekly-hours";
import { withTenant, withTenantTx, type TenantTx } from "@/server/tenant-db";
import { notFoundError, validationError } from "./errors";
import { isUuid } from "./services";

export const PROFESSIONAL_NAME_MAX = 60;

export type ProfessionalInput = {
  id?: string;
  name: string;
  /** Uma cor da paleta (`PROFESSIONAL_COLORS`). */
  color: string;
  active: boolean;
  serviceIds: string[];
  hours: WeeklyHours;
};

export type ProfessionalRow = {
  id: string;
  name: string;
  color: string | null;
  active: boolean;
  sortOrder: number;
  serviceIds: string[];
  hours: WeeklyHours;
  /** Agendamentos futuros não cancelados (continuam marcados se desativar). */
  futureBookings: number;
};

const hm = (t: string) => t.slice(0, 5); // "HH:MM:SS" -> "HH:MM"

async function loadBusinessWeek(tx: TenantTx, tenantId: string): Promise<WeeklyHours> {
  const rows = await tx
    .select()
    .from(businessHours)
    .where(eq(businessHours.tenantId, tenantId));
  const week = emptyWeek();
  for (const r of rows) {
    week[r.weekday as keyof WeeklyHours].push({ start: hm(r.startsAt), end: hm(r.endsAt) });
  }
  return week;
}

async function futureCounts(tx: TenantTx, tenantId: string, now: Date) {
  const rows = await tx
    .select({ professionalId: bookings.professionalId, n: count() })
    .from(bookings)
    .where(
      and(
        eq(bookings.tenantId, tenantId),
        ne(bookings.status, "canceled"),
        gt(bookings.startsAt, now),
      ),
    )
    .groupBy(bookings.professionalId);
  return new Map(rows.map((r) => [r.professionalId, Number(r.n)]));
}

/** Profissionais (ativos e inativos) na ordem de criação, com serviços e expediente. */
export async function listProfessionals(
  db: Db,
  tenantId: string,
  now: Date = new Date(),
): Promise<ProfessionalRow[]> {
  return withTenant(db, tenantId, async (tx) => {
    const rows = await tx
      .select()
      .from(professionals)
      .where(eq(professionals.tenantId, tenantId))
      .orderBy(professionals.sortOrder, professionals.createdAt, professionals.id);
    const links = await tx
      .select()
      .from(professionalServices)
      .where(eq(professionalServices.tenantId, tenantId));
    const hourRows = await tx
      .select()
      .from(professionalHours)
      .where(eq(professionalHours.tenantId, tenantId))
      .orderBy(professionalHours.weekday, professionalHours.startsAt);
    const future = await futureCounts(tx, tenantId, now);

    const serviceIds = new Map<string, string[]>();
    for (const l of links) {
      serviceIds.set(l.professionalId, [...(serviceIds.get(l.professionalId) ?? []), l.serviceId]);
    }
    const weeks = new Map<string, WeeklyHours>();
    for (const h of hourRows) {
      const week = weeks.get(h.professionalId) ?? emptyWeek();
      week[h.weekday as keyof WeeklyHours].push({ start: hm(h.startsAt), end: hm(h.endsAt) });
      weeks.set(h.professionalId, week);
    }

    return rows.map((p) => ({
      id: p.id,
      name: p.name,
      color: p.color,
      active: p.active,
      sortOrder: p.sortOrder,
      serviceIds: serviceIds.get(p.id) ?? [],
      hours: weeks.get(p.id) ?? emptyWeek(),
      futureBookings: future.get(p.id) ?? 0,
    }));
  });
}

function validate(input: ProfessionalInput) {
  const errors: Record<string, string> = {};
  const name = typeof input.name === "string" ? input.name.trim() : "";
  if (name === "") errors.name = "Informe o nome do profissional.";
  else if (name.length > PROFESSIONAL_NAME_MAX)
    errors.name = `Use até ${PROFESSIONAL_NAME_MAX} caracteres no nome.`;

  if (!isProfessionalColor(input.color)) errors.color = "Escolha uma cor da lista.";

  if (!Array.isArray(input.serviceIds) || !input.serviceIds.every(isUuid))
    errors.serviceIds = "Serviço inválido.";

  const hours = input.hours;
  const shapeOk =
    hours !== null &&
    typeof hours === "object" &&
    WEEKDAYS.every((d) => Array.isArray(hours[d]));
  if (!shapeOk) {
    errors.hours = "Horário inválido.";
  } else {
    const invalid = validateWeeklyHours(hours);
    const first = WEEKDAYS.find((d) => invalid[d]);
    if (first !== undefined) errors.hours = invalid[first]!;
  }

  if (Object.keys(errors).length > 0) throw validationError(errors);
  return {
    name,
    color: input.color.toUpperCase(),
    active: input.active === true,
    serviceIds: [...new Set(input.serviceIds)],
    hours,
  };
}

/**
 * Cria ou edita um profissional: cor, serviços que faz e expediente. O
 * expediente precisa caber no horário de funcionamento (por dia da semana).
 */
export async function saveProfessional(
  db: Db,
  tenantId: string,
  input: ProfessionalInput,
): Promise<{ id: string }> {
  const data = validate(input);
  if (input.id !== undefined && !isUuid(input.id)) throw notFoundError();

  return db.transaction(async (outer) => {
    await outer.execute(sql`select pg_advisory_xact_lock(hashtext(${tenantId}))`);
    const [plan] = await outer.select({ limit: plans.maxProfessionals }).from(tenants)
      .innerJoin(plans, eq(tenants.planId, plans.id)).where(eq(tenants.id, tenantId)).limit(1);
    if (!plan) throw notFoundError();
    return withTenantTx(outer, tenantId, async (tx) => {
    if (data.active) {
      const [existing] = input.id ? await tx.select({ active: professionals.active }).from(professionals)
        .where(and(eq(professionals.tenantId, tenantId), eq(professionals.id, input.id))).limit(1) : [];
      if (input.id && !existing) throw notFoundError();
      if (!existing?.active && plan.limit !== null) {
        const [active] = await tx.select({ n: count() }).from(professionals)
          .where(and(eq(professionals.tenantId, tenantId), eq(professionals.active, true)));
        if (active.n >= plan.limit) throw validationError({ active: `Seu plano permite até ${plan.limit} profissionais ativos.` });
      }
    }
    const outside = outsideBusinessHours(data.hours, await loadBusinessWeek(tx, tenantId));
    if (WEEKDAYS.some((d) => outside[d])) {
      throw validationError({ hours: OUTSIDE_BUSINESS_HOURS_MESSAGE });
    }

    // Só serviços ativos (não arquivados) do estabelecimento.
    const activeServices = await tx
      .select({ id: services.id })
      .from(services)
      .where(and(eq(services.tenantId, tenantId), isNull(services.archivedAt)));
    const activeIds = new Set(activeServices.map((s) => s.id));
    if (!data.serviceIds.every((id) => activeIds.has(id))) {
      throw validationError({ serviceIds: "Serviço inválido." });
    }

    const values = { name: data.name, color: data.color, active: data.active };
    let id: string;
    if (input.id) {
      const updated = await tx
        .update(professionals)
        .set(values)
        .where(and(eq(professionals.tenantId, tenantId), eq(professionals.id, input.id)))
        .returning({ id: professionals.id });
      if (updated.length === 0) throw notFoundError();
      id = updated[0].id;
    } else {
      const [{ top }] = await tx
        .select({ top: max(professionals.sortOrder) })
        .from(professionals)
        .where(eq(professionals.tenantId, tenantId));
      const [created] = await tx
        .insert(professionals)
        .values({ tenantId, ...values, sortOrder: (top ?? -1) + 1 })
        .returning({ id: professionals.id });
      id = created.id;
    }

    await tx
      .delete(professionalHours)
      .where(and(eq(professionalHours.tenantId, tenantId), eq(professionalHours.professionalId, id)));
    const hourValues = WEEKDAYS.flatMap((weekday) =>
      data.hours[weekday].map((r) => ({
        tenantId,
        professionalId: id,
        weekday,
        startsAt: r.start,
        endsAt: r.end,
      })),
    );
    if (hourValues.length > 0) await tx.insert(professionalHours).values(hourValues);

    // Troca só os vínculos com serviços ativos: os de serviços arquivados
    // ficam, para voltarem se o serviço for restaurado.
    if (activeIds.size > 0) {
      await tx
        .delete(professionalServices)
        .where(
          and(
            eq(professionalServices.tenantId, tenantId),
            eq(professionalServices.professionalId, id),
            inArray(professionalServices.serviceId, [...activeIds]),
          ),
        );
    }
    if (data.serviceIds.length > 0) {
      await tx.insert(professionalServices).values(
        data.serviceIds.map((serviceId) => ({ tenantId, professionalId: id, serviceId })),
      );
    }
    return { id };
    });
  });
}

/**
 * Desativa o profissional (não é oferecido para novos agendamentos). Os
 * agendamentos futuros continuam marcados; devolve quantos são, para o aviso.
 */
export async function deactivateProfessional(
  db: Db,
  tenantId: string,
  id: string,
  now: Date = new Date(),
): Promise<{ futureBookings: number }> {
  if (!isUuid(id)) throw notFoundError();
  return withTenant(db, tenantId, async (tx) => {
    const updated = await tx
      .update(professionals)
      .set({ active: false })
      .where(and(eq(professionals.tenantId, tenantId), eq(professionals.id, id)))
      .returning({ id: professionals.id });
    if (updated.length === 0) throw notFoundError();
    return { futureBookings: (await futureCounts(tx, tenantId, now)).get(id) ?? 0 };
  });
}
