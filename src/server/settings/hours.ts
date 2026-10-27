import { and, eq } from "drizzle-orm";
import { businessHours, professionalHours, professionals } from "@/db/schema";
import type { Db } from "@/db/types";
import {
  WEEKDAYS,
  clipWeekToBusiness,
  emptyWeek,
  sameWeek,
  validateWeeklyHours,
  type WeeklyHours,
} from "@/lib/weekly-hours";
import { withTenant, type TenantTx } from "@/server/tenant-db";
import { validationError } from "./errors";

const hm = (t: string) => t.slice(0, 5); // "HH:MM:SS" -> "HH:MM"

export async function getBusinessHours(
  db: Db,
  tenantId: string,
): Promise<WeeklyHours> {
  const rows = await withTenant(db, tenantId, (tx) =>
    tx
      .select()
      .from(businessHours)
      .orderBy(businessHours.weekday, businessHours.startsAt),
  );
  const week = emptyWeek();
  for (const r of rows) {
    week[r.weekday as keyof WeeklyHours].push({
      start: hm(r.startsAt),
      end: hm(r.endsAt),
    });
  }
  return week;
}

/**
 * Substitui o horário de funcionamento (apaga e regrava numa transação).
 * Valida antes de tocar no banco: o horário anterior só muda se tudo estiver certo.
 *
 * Na MESMA transação acerta o expediente da equipe: com `applyToTeam`, todos os
 * profissionais ativos passam a ter o novo horário; sem ele, o expediente de
 * cada profissional é recortado à nova janela (nunca fica fora dela) e o que
 * já cabia não muda. Devolve `teamOutOfSync` quando algum ativo ficou com
 * expediente diferente do horário de funcionamento.
 */
export async function updateBusinessHours(
  db: Db,
  tenantId: string,
  hours: WeeklyHours,
  options: { applyToTeam?: boolean } = {},
): Promise<{ teamOutOfSync: boolean }> {
  const errors = validateWeeklyHours(hours);
  const first = WEEKDAYS.find((d) => errors[d]);
  if (first !== undefined) throw validationError({ hours: errors[first]! });

  const toRows = (week: WeeklyHours) =>
    WEEKDAYS.flatMap((weekday) =>
      week[weekday].map((r) => ({ weekday, startsAt: r.start, endsAt: r.end })),
    );
  const values = toRows(hours).map((r) => ({ tenantId, ...r }));
  const applyToTeam = options.applyToTeam === true;

  return withTenant(db, tenantId, async (tx) => {
    await tx.delete(businessHours).where(eq(businessHours.tenantId, tenantId));
    if (values.length > 0) await tx.insert(businessHours).values(values);

    const team = await readTeam(tx, tenantId);
    let teamOutOfSync = false;
    for (const person of team) {
      const next = applyToTeam && person.active ? hours : clipWeekToBusiness(person.week, hours);
      if (!sameWeek(next, person.week)) {
        await tx
          .delete(professionalHours)
          .where(
            and(
              eq(professionalHours.tenantId, tenantId),
              eq(professionalHours.professionalId, person.id),
            ),
          );
        const rows = toRows(next).map((r) => ({ tenantId, professionalId: person.id, ...r }));
        if (rows.length > 0) await tx.insert(professionalHours).values(rows);
      }
      if (person.active && !sameWeek(next, hours)) teamOutOfSync = true;
    }
    return { teamOutOfSync };
  });
}

/** Profissionais (ativos e inativos) com o expediente semanal. */
async function readTeam(tx: TenantTx, tenantId: string) {
  const people = await tx
    .select({ id: professionals.id, active: professionals.active })
    .from(professionals)
    .where(eq(professionals.tenantId, tenantId));
  const rows = await tx
    .select()
    .from(professionalHours)
    .where(eq(professionalHours.tenantId, tenantId));
  const weeks = new Map<string, WeeklyHours>();
  for (const r of rows) {
    const week = weeks.get(r.professionalId) ?? emptyWeek();
    week[r.weekday as keyof WeeklyHours].push({ start: hm(r.startsAt), end: hm(r.endsAt) });
    weeks.set(r.professionalId, week);
  }
  return people.map((p) => ({ ...p, week: weeks.get(p.id) ?? emptyWeek() }));
}

/**
 * Valor inicial de "Aplicar também à equipe": marcado com um único profissional
 * ativo ou quando todos os ativos já trabalham exatamente no horário de funcionamento.
 */
export async function defaultApplyToTeam(db: Db, tenantId: string): Promise<boolean> {
  const business = await getBusinessHours(db, tenantId);
  const team = (await withTenant(db, tenantId, (tx) => readTeam(tx, tenantId))).filter(
    (p) => p.active,
  );
  if (team.length === 0) return false;
  return team.length === 1 || team.every((p) => sameWeek(p.week, business));
}
