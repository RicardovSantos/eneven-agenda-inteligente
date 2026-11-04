import { and, count, eq, gt, inArray, isNull, max, sql } from "drizzle-orm";
import {
  bookings,
  businessHours,
  memberships,
  professionalHours,
  professionalServices,
  sessions,
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
import { cancelBooking } from "@/server/agenda/bookings";
import { withTenant, withTenantTx, type TenantTx } from "@/server/tenant-db";
import { notFoundError, validationError } from "./errors";
import { isUuid } from "./services";

export const PROFESSIONAL_NAME_MAX = 60;
export const PROFESSIONAL_TITLE_MAX = 40;

export type ProfessionalInput = {
  id?: string;
  name: string;
  /** Cargo mostrado na página pública ("Barbeiro"); opcional. */
  title?: string;
  /** Uma cor da paleta (`PROFESSIONAL_COLORS`). */
  color: string;
  active: boolean;
  serviceIds: string[];
  hours: WeeklyHours;
};

export type ProfessionalRow = {
  id: string;
  name: string;
  title: string | null;
  /** Versão da foto (ms) ou `null` sem foto; monta o endereço público. */
  photoVersion: number | null;
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
        inArray(bookings.status, ["scheduled", "confirmed"]),
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
      .where(and(eq(professionals.tenantId, tenantId), isNull(professionals.archivedAt)))
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
      title: p.title,
      photoVersion: p.photoUpdatedAt ? p.photoUpdatedAt.getTime() : null,
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

  const title = typeof input.title === "string" ? input.title.trim() : "";
  if (title.length > PROFESSIONAL_TITLE_MAX)
    errors.title = `Use até ${PROFESSIONAL_TITLE_MAX} caracteres no cargo.`;

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
    title: title === "" ? null : title,
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
      .innerJoin(plans, eq(tenants.planId, plans.id)).where(eq(tenants.id, tenantId)).limit(1).for("share");
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

    const values = { name: data.name, title: data.title, color: data.color, active: data.active };
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

/** Cancela os agendamentos futuros do profissional (cada cliente é avisado). Devolve quantos. */
async function cancelFutureBookings(db: Db, tenantId: string, id: string, now: Date): Promise<number> {
  const ids = await withTenant(db, tenantId, (tx) =>
    tx
      .select({ id: bookings.id })
      .from(bookings)
      .where(
        and(
          eq(bookings.tenantId, tenantId),
          eq(bookings.professionalId, id),
          inArray(bookings.status, ["scheduled", "confirmed"]),
          gt(bookings.startsAt, now),
        ),
      ),
  );
  for (const row of ids) await cancelBooking(db, tenantId, row.id, "staff", now);
  return ids.length;
}

/**
 * Desativa o profissional (não é oferecido para novos agendamentos). Com
 * agendamento futuro a desativação é recusada, a menos que `cancelFuture` seja
 * verdadeiro: aí cancela todos antes (cada cliente é avisado como num
 * cancelamento comum) e desativa. Devolve quantos foram cancelados.
 */
export async function deactivateProfessional(
  db: Db,
  tenantId: string,
  id: string,
  now: Date = new Date(),
  opts: { cancelFuture?: boolean } = {},
): Promise<{ canceledBookings: number; accessRemoved: boolean }> {
  if (!isUuid(id)) throw notFoundError();
  const canceledBookings = opts.cancelFuture ? await cancelFutureBookings(db, tenantId, id, now) : 0;
  return db.transaction(async (raw) => {
    const result = await withTenantTx(raw, tenantId, async (tx) => {
      const [row] = await tx
        .select({ userId: professionals.userId })
        .from(professionals)
        .where(and(eq(professionals.tenantId, tenantId), eq(professionals.id, id), isNull(professionals.archivedAt)))
        .for("update");
      if (!row) throw notFoundError();
      const n = (await futureCounts(tx, tenantId, now)).get(id) ?? 0;
      if (n > 0) {
        throw validationError({
          deactivate: n === 1
            ? "Há 1 agendamento futuro com este profissional. Cancele-os ou remarque antes de desativar."
            : `Há ${n} agendamentos futuros com este profissional. Cancele-os ou remarque antes de desativar.`,
        });
      }
      await tx
        .update(professionals)
        .set({ active: false })
        .where(and(eq(professionals.tenantId, tenantId), eq(professionals.id, id)));
      return row.userId;
    });
    return { canceledBookings, accessRemoved: await cutAccess(raw, tenantId, id, result) };
  });
}

/**
 * Tira o acesso ao painel de quem está ligado ao profissional (vínculo, sessões e
 * `professionals.user_id`). O proprietário nunca perde o acesso. Devolve se tirou.
 */
async function cutAccess(raw: TenantTx, tenantId: string, professionalId: string, userId: string | null) {
  if (!userId) return false;
  const [member] = await raw
    .select({ role: memberships.role })
    .from(memberships)
    .where(and(eq(memberships.userId, userId), eq(memberships.tenantId, tenantId)));
  if (!member || member.role === "owner") return false;
  await raw.delete(memberships).where(and(eq(memberships.userId, userId), eq(memberships.tenantId, tenantId)));
  await raw.delete(sessions).where(and(eq(sessions.userId, userId), eq(sessions.tenantId, tenantId)));
  await withTenantTx(raw, tenantId, (tx) =>
    tx
      .update(professionals)
      .set({ userId: null })
      .where(and(eq(professionals.tenantId, tenantId), eq(professionals.id, professionalId))),
  );
  return true;
}

/**
 * Remove o profissional da equipe: some das telas, fica inativo e perde o acesso,
 * mas o histórico de agendamentos continua. Recusa se ainda houver agendamento
 * futuro (o dono precisa remarcar ou cancelar antes).
 */
export async function removeProfessional(
  db: Db,
  tenantId: string,
  id: string,
  now: Date = new Date(),
  opts: { cancelFuture?: boolean } = {},
): Promise<{ canceledBookings: number; accessRemoved: boolean }> {
  if (!isUuid(id)) throw notFoundError();
  const canceledBookings = opts.cancelFuture ? await cancelFutureBookings(db, tenantId, id, now) : 0;
  return db.transaction(async (raw) => {
    const result = await withTenantTx(raw, tenantId, async (tx) => {
      const [row] = await tx
        .select({ userId: professionals.userId })
        .from(professionals)
        .where(and(eq(professionals.tenantId, tenantId), eq(professionals.id, id), isNull(professionals.archivedAt)))
        .for("update");
      if (!row) throw notFoundError();
      const n = (await futureCounts(tx, tenantId, now)).get(id) ?? 0;
      if (n > 0) {
        throw validationError({
          remove: n === 1
            ? "Há 1 agendamento futuro com este profissional. Remarque ou cancele antes de remover."
            : `Há ${n} agendamentos futuros com este profissional. Remarque ou cancele antes de remover.`,
        });
      }
      await tx
        .update(professionals)
        .set({ active: false, archivedAt: now })
        .where(and(eq(professionals.tenantId, tenantId), eq(professionals.id, id)));
      return row.userId;
    });
    return { canceledBookings, accessRemoved: await cutAccess(raw, tenantId, id, result) };
  });
}
