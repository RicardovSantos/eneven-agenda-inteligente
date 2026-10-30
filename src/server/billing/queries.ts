import { asc, desc, eq } from "drizzle-orm";
import { billingInvoices, plans, tenants } from "@/db/schema";
import type { Db } from "@/db/types";
import { withTenant } from "@/server/tenant-db";

/** Chamador deve verificar que a sessão pertence ao estabelecimento e é do dono. */
export async function getBillingOverview(db: Db, tenantId: string) {
  const [current] = await db.select({ id: plans.id, name: plans.name, status: tenants.status })
    .from(tenants).innerJoin(plans, eq(plans.id, tenants.planId)).where(eq(tenants.id, tenantId)).limit(1);
  if (!current) throw new Error("Estabelecimento não encontrado.");
  const available = await db.select({ id: plans.id, name: plans.name, priceCents: plans.priceCents, maxProfessionals: plans.maxProfessionals, monthlyMessages: plans.monthlyMessages })
    .from(plans).where(eq(plans.active, true)).orderBy(asc(plans.sortOrder));
  const invoices = await withTenant(db, tenantId, (tx) => tx.select({ id: billingInvoices.id, amountCents: billingInvoices.amountCents, status: billingInvoices.providerStatus, dueAt: billingInvoices.dueAt, paidAt: billingInvoices.paidAt })
    .from(billingInvoices).where(eq(billingInvoices.tenantId, tenantId)).orderBy(desc(billingInvoices.createdAt), desc(billingInvoices.id)).limit(100));
  return { current, available, invoices };
}
