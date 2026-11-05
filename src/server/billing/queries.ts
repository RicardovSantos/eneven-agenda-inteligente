import { and, asc, count, desc, eq, notInArray } from "drizzle-orm";
import { billingCharges, billingInvoices, billingSubscriptions, plans, professionals, tenants } from "@/db/schema";
import type { Db } from "@/db/types";
import { withTenant } from "@/server/tenant-db";

/** Chamador deve verificar que a sessão pertence ao estabelecimento e é do dono. */
export async function getBillingOverview(db: Db, tenantId: string) {
  const [current] = await db.select({ id: plans.id, name: plans.name, status: tenants.status })
    .from(tenants).innerJoin(plans, eq(plans.id, tenants.planId)).where(eq(tenants.id, tenantId)).limit(1);
  if (!current) throw new Error("Estabelecimento não encontrado.");
  const available = await db.select({ id: plans.id, name: plans.name, priceCents: plans.priceCents, maxProfessionals: plans.maxProfessionals, monthlyMessages: plans.monthlyMessages })
    .from(plans).where(eq(plans.active, true)).orderBy(asc(plans.sortOrder));
  const invoices = await withTenant(db, tenantId, (tx) => tx.select({ id: billingInvoices.id, amountCents: billingInvoices.amountCents, status: billingInvoices.providerStatus, dueAt: billingInvoices.dueAt, paidAt: billingInvoices.paidAt, createdAt: billingInvoices.createdAt })
    .from(billingInvoices).where(eq(billingInvoices.tenantId, tenantId)).orderBy(desc(billingInvoices.createdAt), desc(billingInvoices.id)).limit(100));
  const [pending] = await withTenant(db, tenantId, (tx) => tx.select({ checkoutUrl: billingSubscriptions.checkoutUrl }).from(billingSubscriptions)
    .where(and(eq(billingSubscriptions.tenantId, tenantId), eq(billingSubscriptions.providerStatus, "pending")))
    .orderBy(desc(billingSubscriptions.createdAt)).limit(1));
  const [subscription] = await withTenant(db, tenantId, (tx) => tx.select({ providerStatus: billingSubscriptions.providerStatus, accessUntil: billingSubscriptions.accessUntil, scheduledPlanId: billingSubscriptions.scheduledPlanId }).from(billingSubscriptions)
    .where(and(eq(billingSubscriptions.tenantId, tenantId), notInArray(billingSubscriptions.providerStatus, ["abandoned", "creating", "uncertain"])))
    .orderBy(desc(billingSubscriptions.createdAt)).limit(1));
  const [professionalCount] = await withTenant(db, tenantId, (tx) => tx.select({ n: count() }).from(professionals).where(and(eq(professionals.tenantId, tenantId), eq(professionals.active, true))));
  const charges = await withTenant(db, tenantId, (tx) => tx.select({
    id: billingCharges.id, method: billingCharges.method, status: billingCharges.status, amountCents: billingCharges.amountCents,
    qrCode: billingCharges.qrCode, qrCodeBase64: billingCharges.qrCodeBase64, ticketUrl: billingCharges.ticketUrl, barcode: billingCharges.barcode,
    expiresAt: billingCharges.expiresAt, paidAt: billingCharges.paidAt, periodEnd: billingCharges.periodEnd, createdAt: billingCharges.createdAt,
  }).from(billingCharges).where(eq(billingCharges.tenantId, tenantId)).orderBy(desc(billingCharges.createdAt)).limit(24));
  const [paid] = await db.select({ paidUntil: tenants.paidUntil }).from(tenants).where(eq(tenants.id, tenantId)).limit(1);
  const now = Date.now();
  const paidUntil = paid?.paidUntil ?? null;
  const paidActive = paidUntil !== null && paidUntil.getTime() > now;
  // Última cobrança paga há menos de uma hora: a tela mostra o aviso de "Pagamento confirmado".
  const justPaid = charges[0]?.status === "approved" && charges[0].paidAt !== null && now - charges[0].paidAt.getTime() < 60 * 60_000;
  return { charges, paidUntil, paidActive, justPaid, current, available, invoices, pendingCheckoutUrl: pending?.checkoutUrl ?? null, subscription: subscription ?? null, activeProfessionals: Number(professionalCount?.n ?? 0) };
}
