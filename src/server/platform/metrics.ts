import { and, count, eq, gt, gte, isNotNull, lte, ne, or, sql } from "drizzle-orm";
import { bookings, plans, tenants } from "@/db/schema";
import type { Db } from "@/db/types";

const DAY_MS = 86_400_000;

export type PlatformMetrics = {
  /** Soma dos preços (centavos) dos planos dos estabelecimentos `active`. */
  mrrCents: number;
  activeCount: number;
  /** Testes em andamento (`trial` com prazo no futuro). */
  trialCount: number;
  trialEndingIn7Days: number;
  /** Convertidos = já ativaram; finalizados = ativaram ou o teste terminou. */
  conversion: { converted: number; finished: number; rate: number | null };
  /** Agendamentos não cancelados com início nos últimos 30 dias. */
  bookings30d: number;
  /** Parte desses agendamentos que veio da página pública (0 a 1). */
  publicShare: number | null;
};

/**
 * Números da plataforma. Consultas agregadas entre estabelecimentos, feitas na
 * conexão do dono do banco: só chame depois de `requireSuperAdminSession()`.
 */
export async function getPlatformMetrics(
  db: Db,
  now: Date = new Date(),
): Promise<PlatformMetrics> {
  const in7Days = new Date(now.getTime() + 7 * DAY_MS);
  const since = new Date(now.getTime() - 30 * DAY_MS);

  const [mrr] = await db
    .select({
      total: sql<number>`coalesce(sum(${plans.priceCents}), 0)::int`,
      activeCount: count(),
    })
    .from(tenants)
    .innerJoin(plans, eq(plans.id, tenants.planId))
    .where(eq(tenants.status, "active"));

  const [trials] = await db
    .select({
      running: sql<number>`count(*) filter (where ${gt(tenants.trialEndsAt, now)})::int`,
      ending: sql<number>`count(*) filter (where ${gt(tenants.trialEndsAt, now)} and ${lte(tenants.trialEndsAt, in7Days)})::int`,
    })
    .from(tenants)
    .where(eq(tenants.status, "trial"));

  const [conv] = await db
    .select({
      converted: sql<number>`count(*) filter (where ${isNotNull(tenants.activatedAt)})::int`,
      finished: sql<number>`count(*) filter (where ${or(isNotNull(tenants.activatedAt), lte(tenants.trialEndsAt, now))})::int`,
    })
    .from(tenants);

  const [usage] = await db
    .select({
      total: count(),
      publicCount: sql<number>`count(*) filter (where ${eq(bookings.source, "public")})::int`,
    })
    .from(bookings)
    .where(and(gte(bookings.startsAt, since), lte(bookings.startsAt, now), ne(bookings.status, "canceled")));

  return {
    mrrCents: mrr.total,
    activeCount: mrr.activeCount,
    trialCount: trials.running,
    trialEndingIn7Days: trials.ending,
    conversion: {
      converted: conv.converted,
      finished: conv.finished,
      rate: conv.finished > 0 ? conv.converted / conv.finished : null,
    },
    bookings30d: usage.total,
    publicShare: usage.total > 0 ? usage.publicCount / usage.total : null,
  };
}
