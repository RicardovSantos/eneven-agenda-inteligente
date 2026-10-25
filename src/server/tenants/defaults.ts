import { and, count, eq, sql } from "drizzle-orm";
import {
  businessHours,
  memberships,
  professionalHours,
  professionals,
  users,
} from "@/db/schema";
import type { Db } from "@/db/types";
import { defaultBusinessHours, WEEKDAYS } from "@/lib/weekly-hours";
import { withTenantTx, type TenantTx } from "@/server/tenant-db";

/** Cor do primeiro profissional (a do dono): a primeira da paleta. */
export const OWNER_PROFESSIONAL_COLOR = "#3E07D2";

type Hour = { weekday: number; startsAt: string; endsAt: string };

const defaultHourRows = (): Hour[] => {
  const week = defaultBusinessHours();
  return WEEKDAYS.flatMap((weekday) =>
    week[weekday].map((r) => ({ weekday, startsAt: r.start, endsAt: r.end })),
  );
};

/** Dentro de `withTenantTx`: cria o dono como profissional, com o horário dado. */
async function insertOwnerProfessional(
  t: TenantTx,
  input: { tenantId: string; ownerUserId: string; ownerName: string },
  hours: Hour[],
) {
  const { tenantId } = input;
  const [owner] = await t
    .insert(professionals)
    .values({
      tenantId,
      name: input.ownerName,
      color: OWNER_PROFESSIONAL_COLOR,
      userId: input.ownerUserId,
      sortOrder: 0,
    })
    .returning({ id: professionals.id });
  if (hours.length > 0) {
    await t
      .insert(professionalHours)
      .values(hours.map((h) => ({ tenantId, professionalId: owner.id, ...h })));
  }
}

/**
 * O que todo estabelecimento novo já tem ao entrar: horário de funcionamento
 * padrão e o dono como primeiro profissional (mesmo horário). Roda dentro da
 * transação do cadastro, sob as regras de RLS do próprio tenant.
 */
export async function seedTenantDefaults(
  tx: TenantTx,
  input: { tenantId: string; ownerUserId: string; ownerName: string },
): Promise<void> {
  const hours = defaultHourRows();
  await withTenantTx(tx, input.tenantId, async (t) => {
    await t
      .insert(businessHours)
      .values(hours.map((h) => ({ tenantId: input.tenantId, ...h })));
    await insertOwnerProfessional(t, input, hours);
  });
}

/**
 * Estabelecimentos criados antes do seed do cadastro: garante, sem duplicar,
 * o horário padrão (se não há nenhum) e o dono como profissional (se não há
 * nenhum profissional). Seguro em chamadas repetidas e simultâneas: uma trava
 * de aconselhamento por tenant serializa as transações.
 */
export async function ensureTenantDefaults(db: Db, tenantId: string): Promise<void> {
  await db.transaction(async (tx) => {
    await tx.execute(sql`select pg_advisory_xact_lock(hashtext(${tenantId}))`);

    const [owner] = await tx
      .select({ userId: users.id, name: users.name })
      .from(memberships)
      .innerJoin(users, eq(users.id, memberships.userId))
      .where(and(eq(memberships.tenantId, tenantId), eq(memberships.role, "owner")))
      .orderBy(users.createdAt)
      .limit(1);

    await withTenantTx(tx, tenantId, async (t) => {
      const [h] = await t
        .select({ n: count() })
        .from(businessHours)
        .where(eq(businessHours.tenantId, tenantId));
      if (Number(h.n) === 0) {
        await t
          .insert(businessHours)
          .values(defaultHourRows().map((r) => ({ tenantId, ...r })));
      }

      const [p] = await t
        .select({ n: count() })
        .from(professionals)
        .where(eq(professionals.tenantId, tenantId));
      if (Number(p.n) === 0 && owner) {
        const rows = await t
          .select()
          .from(businessHours)
          .where(eq(businessHours.tenantId, tenantId));
        await insertOwnerProfessional(
          t,
          { tenantId, ownerUserId: owner.userId, ownerName: owner.name },
          rows.map((r) => ({
            weekday: r.weekday,
            startsAt: r.startsAt,
            endsAt: r.endsAt,
          })),
        );
      }
    });
  });
}
