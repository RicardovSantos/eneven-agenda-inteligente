import { and, asc, eq, gt, inArray, lte, ne } from "drizzle-orm";
import { billingInvoices, tenants } from "@/db/schema";
import type { Db } from "@/db/types";
import { reconcileBillingAccess } from "./reconcile-access";
import { billingAccessEnabled } from "./mode";

/** Percorre todas as páginas para não deixar estabelecimentos para trás. */
export async function reconcileDueBillingAccess(db: Db, config: { accessToken: string; liveMode: boolean }, now = new Date()) {
  if (!billingAccessEnabled(config)) throw new Error("Conciliação indisponível neste ambiente.");
  if (!Number.isFinite(now.getTime())) throw new Error("Data inválida.");
  const result = { updated: 0, unchanged: 0, review: 0, failed: 0 };
  let cursor: string | undefined;
  for (;;) {
    const page = await db.selectDistinct({ tenantId: tenants.id }).from(tenants)
      .innerJoin(billingInvoices, eq(billingInvoices.tenantId, tenants.id))
      .where(and(inArray(tenants.status, ["trial", "active", "past_due"]), lte(tenants.trialEndsAt, now), lte(billingInvoices.dueAt, now), ne(billingInvoices.providerStatus, "approved"), cursor ? gt(tenants.id, cursor) : undefined))
      .orderBy(asc(tenants.id)).limit(100);
    if (!page.length) return result;
    for (const { tenantId } of page) {
      try {
        result[await reconcileBillingAccess(db, tenantId, now)]++;
      } catch {
        result.failed++;
      }
    }
    cursor = page[page.length - 1].tenantId;
  }
}
