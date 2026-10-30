import { and, asc, eq, isNull, lte, or, sql } from "drizzle-orm";
import { auditLog, tenants } from "@/db/schema";
import type { Db } from "@/db/types";

/** Consulta para revisão humana; não autoriza nem executa exclusão. */
export async function listRetentionReview(db: Db, now = new Date(), page = 1) {
  if (!Number.isFinite(now.getTime())) throw new Error("Data inválida.");
  if (!Number.isSafeInteger(page) || page < 1 || page > 20_000) throw new Error("Página inválida.");
  const cutoff = new Date(now.getTime() - 90 * 86_400_000);
  const canceled = db.select({ tenantId: auditLog.tenantId, lastCanceled: sql<Date>`max(${auditLog.createdAt})`.mapWith(auditLog.createdAt).as("last_canceled") })
    .from(auditLog).where(eq(auditLog.action, "tenant.canceled")).groupBy(auditLog.tenantId).as("canceled");
  const rows = await db.select({ id: tenants.id, name: tenants.name, slug: tenants.slug, status: tenants.status, trialEndsAt: tenants.trialEndsAt, lastCanceled: canceled.lastCanceled })
    .from(tenants).leftJoin(canceled, eq(canceled.tenantId, tenants.id))
    .where(or(and(eq(tenants.status, "trial"), lte(tenants.trialEndsAt, cutoff)), and(eq(tenants.status, "canceled"), or(isNull(canceled.lastCanceled), sql`${canceled.lastCanceled} <= ${cutoff.toISOString()}::timestamptz`))))
    .orderBy(asc(tenants.name), asc(tenants.id)).limit(51).offset((page - 1) * 50);
  return { items: rows.slice(0, 50), hasMore: rows.length > 50, page };
}
