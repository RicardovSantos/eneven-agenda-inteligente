import { and, asc, eq, lte, or, sql } from "drizzle-orm";
import { auditLog, tenants } from "@/db/schema";
import type { Db } from "@/db/types";

/** Consulta para revisão humana; não autoriza nem executa exclusão. */
export async function listRetentionReview(db: Db, now = new Date()) {
  if (!Number.isFinite(now.getTime())) throw new Error("Data inválida.");
  const cutoff = new Date(now.getTime() - 90 * 86_400_000);
  const canceled = db.select({ tenantId: auditLog.tenantId, lastCanceled: sql<Date>`max(${auditLog.createdAt})`.mapWith(auditLog.createdAt).as("last_canceled") })
    .from(auditLog).where(eq(auditLog.action, "tenant.canceled")).groupBy(auditLog.tenantId).as("canceled");
  return db.select({ id: tenants.id, name: tenants.name, slug: tenants.slug, status: tenants.status, trialEndsAt: tenants.trialEndsAt, lastCanceled: canceled.lastCanceled })
    .from(tenants).leftJoin(canceled, eq(canceled.tenantId, tenants.id))
    .where(or(and(eq(tenants.status, "trial"), lte(tenants.trialEndsAt, cutoff)), and(eq(tenants.status, "canceled"), lte(canceled.lastCanceled, cutoff))))
    .orderBy(asc(tenants.name), asc(tenants.id)).limit(100);
}
