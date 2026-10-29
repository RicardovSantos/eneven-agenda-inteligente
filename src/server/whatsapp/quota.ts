import { and, count, eq, gte, inArray, lt, sql } from "drizzle-orm";
import { plans, tenants, whatsappMessages } from "@/db/schema";
import type { Db } from "@/db/types";
import { addDaysToDate, localDateOf, zonedInstant } from "@/server/agenda/time";
import { withTenant } from "@/server/tenant-db";

/** Consulta informativa; a reserva da cota deve ser atômica no processamento da fila. */
export async function checkTenantQuota(db: Db, tenantId: string, now: Date = new Date()) {
  const [tenant] = await db.select({ timezone: tenants.timezone, status: tenants.status, monthlyMessages: plans.monthlyMessages })
    .from(tenants).innerJoin(plans, eq(plans.id, tenants.planId)).where(eq(tenants.id, tenantId)).limit(1);
  if (!tenant) throw new Error("Estabelecimento não encontrado.");
  const first = `${localDateOf(now, tenant.timezone).slice(0, 7)}-01`;
  const next = `${addDaysToDate(`${first.slice(0, 7)}-28`, 4).slice(0, 7)}-01`;
  const start = zonedInstant(first, 0, tenant.timezone);
  const end = zonedInstant(next, 0, tenant.timezone);
  const [row] = await withTenant(db, tenantId, (tx) => tx.select({ used: count() }).from(whatsappMessages)
    .where(and(eq(whatsappMessages.tenantId, tenantId), eq(whatsappMessages.direction, "outbound"),
      inArray(whatsappMessages.status, ["sending", "sent", "delivered", "read"]),
      gte(whatsappMessages.createdAt, start), lt(whatsappMessages.createdAt, end))));
  const total = tenant.status === "trial" ? 50 : tenant.monthlyMessages;
  return { used: row.used, total, allowed: row.used < total };
}

/** Agregado global da plataforma, não expõe números de destinatários. */
export async function checkMetaDailyLimit(db: Db, now: Date = new Date()) {
  const [row] = await db.select({ count: sql<number>`count(distinct ${whatsappMessages.recipientPhone})::int` })
    .from(whatsappMessages).where(and(eq(whatsappMessages.direction, "outbound"),
      inArray(whatsappMessages.status, ["sending", "sent", "delivered", "read"]),
      gte(whatsappMessages.createdAt, new Date(now.getTime() - 24 * 60 * 60 * 1000)),
      lt(whatsappMessages.createdAt, now)));
  return { count: row.count, allowed: row.count < 250, warnSuperAdmin: row.count >= 175 };
}
