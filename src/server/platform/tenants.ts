import { and, desc, eq, gt, gte, inArray, isNull, lte, ne, or, sql, type SQL } from "drizzle-orm";
import {
  auditLog,
  bookings,
  customers,
  invitations,
  memberships,
  plans,
  professionals,
  services,
  tenants,
  users,
} from "@/db/schema";
import type { Db } from "@/db/types";
import { withTenant } from "@/server/tenant-db";
import { tenantSituation, type TenantSituation } from "@/server/tenants/release";
import { UUID } from "./errors";
import { checkTenantQuota } from "@/server/whatsapp/quota";

const DAY_MS = 86_400_000;
export const PLATFORM_PAGE_SIZE = 50;

export type PlatformTenantItem = {
  id: string;
  name: string;
  slug: string;
  ownerName: string | null;
  ownerEmail: string | null;
  situation: TenantSituation;
  trialEndsAt: Date;
  activatedAt: Date | null;
  planName: string;
  bookings30d: number;
  ownerLastLoginAt: Date | null;
  createdAt: Date;
  whatsappUsage?: { used: number; total: number; allowed: boolean };
};

export type PlatformTenantList = {
  items: PlatformTenantItem[];
  total: number;
  counts: Record<TenantSituation | "all", number>;
};

/** Condição SQL de cada situação (a mesma regra de `tenantSituation`). */
function situationCondition(situation: TenantSituation, now: Date): SQL {
  switch (situation) {
    case "trial":
      return and(eq(tenants.status, "trial"), gt(tenants.trialEndsAt, now))!;
    case "trial_expired":
      return and(eq(tenants.status, "trial"), lte(tenants.trialEndsAt, now))!;
    default:
      return eq(tenants.status, situation);
  }
}

const SITUATIONS: readonly TenantSituation[] = [
  "trial",
  "trial_expired",
  "active",
  "past_due",
  "read_only",
  "canceled",
];

const escapeLike = (value: string) => value.replace(/[\\%_]/g, (c) => `\\${c}`);

/**
 * Lista de estabelecimentos da plataforma. Consultas entre estabelecimentos na
 * conexão do dono do banco: só chame depois de `requireSuperAdminSession()`.
 */
export async function listPlatformTenants(
  db: Db,
  input: { situation?: TenantSituation; query?: string; page: number; now?: Date; quotaExceeded?: boolean },
): Promise<PlatformTenantList> {
  const now = input.now ?? new Date();
  // Valor desconhecido (ex.: vindo da URL) vale como "todas", sem chegar ao enum do banco.
  const situation =
    input.situation && SITUATIONS.includes(input.situation) ? input.situation : undefined;
  const page = Math.max(1, Math.floor(input.page) || 1);

  const q = input.query?.trim().slice(0, 100);
  const pattern = q ? `%${escapeLike(q)}%` : null;
  const search = pattern
    ? or(
        sql`${tenants.name} ilike ${pattern} escape '\\'`,
        sql`${tenants.slug} ilike ${pattern} escape '\\'`,
        sql`exists (
          select 1 from ${memberships} m
          inner join ${users} u on u.id = m.user_id
          where m.tenant_id = ${tenants.id} and m.role = 'owner'
            and u.email ilike ${pattern} escape '\\'
        )`,
      )
    : undefined;

  const exhausted = input.quotaExceeded ? sql`(select count(*) from whatsapp_messages wm where wm.tenant_id = ${tenants.id} and wm.direction = 'outbound' and wm.status in ('sending','sent','delivered','read') and wm.created_at >= date_trunc('month', ${now.toISOString()}::timestamptz at time zone ${tenants.timezone}) at time zone ${tenants.timezone} and wm.created_at < (date_trunc('month', ${now.toISOString()}::timestamptz at time zone ${tenants.timezone}) + interval '1 month') at time zone ${tenants.timezone}) >= case when ${tenants.status} = 'trial' then 50 else (select monthly_messages from plans where id = ${tenants.planId}) end` : undefined;
  const where = and(search, situation ? situationCondition(situation, now) : undefined, exhausted);

  const [countRow] = await db
    .select({
      all: sql<number>`count(*)::int`,
      trial: sql<number>`count(*) filter (where ${situationCondition("trial", now)})::int`,
      trial_expired: sql<number>`count(*) filter (where ${situationCondition("trial_expired", now)})::int`,
      active: sql<number>`count(*) filter (where ${eq(tenants.status, "active")})::int`,
      past_due: sql<number>`count(*) filter (where ${eq(tenants.status, "past_due")})::int`,
      read_only: sql<number>`count(*) filter (where ${eq(tenants.status, "read_only")})::int`,
      canceled: sql<number>`count(*) filter (where ${eq(tenants.status, "canceled")})::int`,
    })
    .from(tenants)
    .where(search);
  const counts = { ...countRow };

  const total = situation || exhausted ? await countWhere(db, where) : counts.all;

  const rows = await db
    .select({
      id: tenants.id,
      name: tenants.name,
      slug: tenants.slug,
      status: tenants.status,
      trialEndsAt: tenants.trialEndsAt,
      activatedAt: tenants.activatedAt,
      planName: plans.name,
      createdAt: tenants.createdAt,
    })
    .from(tenants)
    .innerJoin(plans, eq(plans.id, tenants.planId))
    .where(where)
    .orderBy(desc(tenants.createdAt), desc(tenants.id))
    .limit(PLATFORM_PAGE_SIZE)
    .offset((page - 1) * PLATFORM_PAGE_SIZE);

  const ids = rows.map((r) => r.id);
  const whatsappUsage = new Map(await Promise.all(ids.map(async (id) => [id, await checkTenantQuota(db, id, now)] as const)));
  const owners = ids.length
    ? await db
        .select({
          tenantId: memberships.tenantId,
          name: users.name,
          email: users.email,
          lastLoginAt: users.lastLoginAt,
        })
        .from(memberships)
        .innerJoin(users, eq(users.id, memberships.userId))
        .where(and(inArray(memberships.tenantId, ids), eq(memberships.role, "owner")))
        .orderBy(users.createdAt)
    : [];
  const since = new Date(now.getTime() - 30 * DAY_MS);
  const usage = ids.length
    ? await db
        .select({ tenantId: bookings.tenantId, total: sql<number>`count(*)::int` })
        .from(bookings)
        .where(
          and(
            inArray(bookings.tenantId, ids),
            gte(bookings.startsAt, since),
            lte(bookings.startsAt, now),
            ne(bookings.status, "canceled"),
          ),
        )
        .groupBy(bookings.tenantId)
    : [];

  const ownerOf = new Map<string, (typeof owners)[number]>();
  for (const o of owners) if (!ownerOf.has(o.tenantId)) ownerOf.set(o.tenantId, o);
  const usageOf = new Map(usage.map((u) => [u.tenantId, u.total]));

  return {
    total,
    counts,
    items: rows.map((r) => {
      const owner = ownerOf.get(r.id);
      return {
        id: r.id,
        name: r.name,
        slug: r.slug,
        ownerName: owner?.name ?? null,
        ownerEmail: owner?.email ?? null,
        situation: tenantSituation(r, now),
        trialEndsAt: r.trialEndsAt,
        activatedAt: r.activatedAt,
        planName: r.planName,
        bookings30d: usageOf.get(r.id) ?? 0,
        ownerLastLoginAt: owner?.lastLoginAt ?? null,
        createdAt: r.createdAt,
        whatsappUsage: whatsappUsage.get(r.id),
      };
    }),
  };
}

async function countWhere(db: Db, where: SQL | undefined): Promise<number> {
  const [row] = await db
    .select({ total: sql<number>`count(*)::int` })
    .from(tenants)
    .where(where);
  return row.total;
}

export type PlatformTenantDetail = {
  id: string;
  name: string;
  slug: string;
  status: (typeof tenants.$inferSelect)["status"];
  situation: TenantSituation;
  trialEndsAt: Date;
  activatedAt: Date | null;
  createdAt: Date;
  whatsapp: string | null;
  plan: {
    id: string;
    code: string;
    name: string;
    priceCents: number;
    maxProfessionals: number | null;
    monthlyMessages: number;
  };
  owner: {
    userId: string;
    name: string;
    email: string;
    emailVerified: boolean;
    hasPassword: boolean;
    lastLoginAt: Date | null;
  } | null;
  pendingOwnerInvite: { email: string; sentAt: Date; expiresAt: Date } | null;
  usage: {
    bookings30d: number;
    customers: number;
    activeProfessionals: number;
    maxProfessionals: number | null;
    activeServices: number;
  };
  audit: Array<{
    id: number;
    action: string;
    details: unknown;
    createdAt: Date;
    actorName: string | null;
  }>;
};

/**
 * Ficha de um estabelecimento. Dados do tenant (agendamentos, clientes...) são
 * lidos dentro de `withTenant`; o resto são consultas da plataforma. Só chame
 * depois de `requireSuperAdminSession()`.
 */
export async function getPlatformTenant(
  db: Db,
  tenantId: string,
  now: Date = new Date(),
): Promise<PlatformTenantDetail | null> {
  if (!UUID.test(tenantId)) return null;
  const [row] = await db
    .select({ tenant: tenants, plan: plans })
    .from(tenants)
    .innerJoin(plans, eq(plans.id, tenants.planId))
    .where(eq(tenants.id, tenantId))
    .limit(1);
  if (!row) return null;
  const { tenant, plan } = row;

  // Dono e auditoria ficam fora de withTenant de propósito: `agenda_app` não
  // tem grant em memberships/users/audit_log (só a conexão da plataforma lê).
  const [owner] = await db
    .select({
      userId: users.id,
      name: users.name,
      email: users.email,
      emailVerifiedAt: users.emailVerifiedAt,
      passwordHash: users.passwordHash,
      lastLoginAt: users.lastLoginAt,
    })
    .from(memberships)
    .innerJoin(users, eq(users.id, memberships.userId))
    .where(and(eq(memberships.tenantId, tenantId), eq(memberships.role, "owner")))
    .orderBy(users.createdAt)
    .limit(1);

  const since = new Date(now.getTime() - 30 * DAY_MS);
  const { invite, usage } = await withTenant(db, tenantId, async (tx) => {
    const [pending] = await tx
      .select({
        email: invitations.email,
        sentAt: invitations.sentAt,
        expiresAt: invitations.expiresAt,
      })
      .from(invitations)
      .where(
        and(
          eq(invitations.tenantId, tenantId),
          eq(invitations.role, "owner"),
          isNull(invitations.acceptedAt),
          isNull(invitations.revokedAt),
          gt(invitations.expiresAt, now),
        ),
      )
      .orderBy(desc(invitations.sentAt))
      .limit(1);
    const [b] = await tx
      .select({ total: sql<number>`count(*)::int` })
      .from(bookings)
      .where(
        and(
          eq(bookings.tenantId, tenantId),
          gte(bookings.startsAt, since),
          lte(bookings.startsAt, now),
          ne(bookings.status, "canceled"),
        ),
      );
    const [c] = await tx
      .select({ total: sql<number>`count(*)::int` })
      .from(customers)
      .where(eq(customers.tenantId, tenantId));
    const [p] = await tx
      .select({ total: sql<number>`count(*)::int` })
      .from(professionals)
      .where(and(eq(professionals.tenantId, tenantId), eq(professionals.active, true)));
    const [s] = await tx
      .select({ total: sql<number>`count(*)::int` })
      .from(services)
      .where(and(eq(services.tenantId, tenantId), isNull(services.archivedAt)));
    return {
      invite: pending ?? null,
      usage: {
        bookings30d: b.total,
        customers: c.total,
        activeProfessionals: p.total,
        maxProfessionals: plan.maxProfessionals,
        activeServices: s.total,
      },
    };
  });

  const audit = await db
    .select({
      id: auditLog.id,
      action: auditLog.action,
      details: auditLog.details,
      createdAt: auditLog.createdAt,
      actorName: users.name,
    })
    .from(auditLog)
    .leftJoin(users, eq(users.id, auditLog.actorUserId))
    .where(eq(auditLog.tenantId, tenantId))
    .orderBy(desc(auditLog.createdAt), desc(auditLog.id))
    .limit(20);

  return {
    id: tenant.id,
    name: tenant.name,
    slug: tenant.slug,
    status: tenant.status,
    situation: tenantSituation(tenant, now),
    trialEndsAt: tenant.trialEndsAt,
    activatedAt: tenant.activatedAt,
    createdAt: tenant.createdAt,
    whatsapp: tenant.whatsapp,
    plan: {
      id: plan.id,
      code: plan.code,
      name: plan.name,
      priceCents: plan.priceCents,
      maxProfessionals: plan.maxProfessionals,
      monthlyMessages: plan.monthlyMessages,
    },
    owner: owner
      ? {
          userId: owner.userId,
          name: owner.name,
          email: owner.email,
          emailVerified: owner.emailVerifiedAt !== null,
          hasPassword: owner.passwordHash !== null,
          lastLoginAt: owner.lastLoginAt,
        }
      : null,
    pendingOwnerInvite: invite,
    usage,
    audit,
  };
}
