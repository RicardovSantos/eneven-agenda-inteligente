import { eq } from "drizzle-orm";
import { billingCharges, billingInvoices, billingPaymentAttempts, billingSubscriptions, deletedTenantBilling } from "@/db/schema";
import type { TenantTx } from "@/server/tenant-db";

type Provider = "mercadopago" | "stripe";
type Row = typeof deletedTenantBilling.$inferInsert;

const asProvider = (value: string): Provider => (value === "stripe" ? "stripe" : "mercadopago");

/**
 * Guarda, antes de apagar o estabelecimento, os identificadores de cobrança no provedor e os valores
 * pagos (nenhum dado pessoal). Os avisos que o provedor ainda manda depois da exclusão são reconhecidos
 * por esses identificadores (veja `isDeletedBillingResource`), e o histórico de recebimentos fica em
 * `deleted_tenant_billing` (`invoice` e `charge` com `paid_at`).
 */
export async function archiveTenantBilling(tx: TenantTx, tenantId: string): Promise<number> {
  const rows: Row[] = [];
  const subscriptions = await tx.select().from(billingSubscriptions).where(eq(billingSubscriptions.tenantId, tenantId));
  const providerOf = new Map(subscriptions.map((subscription) => [subscription.id, asProvider(subscription.provider)]));
  for (const subscription of subscriptions) {
    if (subscription.providerId) rows.push({ tenantRef: tenantId, provider: asProvider(subscription.provider), kind: "subscription", resourceId: subscription.providerId });
  }
  const invoices = await tx.select().from(billingInvoices).where(eq(billingInvoices.tenantId, tenantId));
  for (const invoice of invoices) {
    const provider = providerOf.get(invoice.subscriptionId) ?? "mercadopago";
    rows.push({ tenantRef: tenantId, provider, kind: "invoice", resourceId: invoice.providerId, amountCents: invoice.paidAt ? invoice.amountCents : null, paidAt: invoice.paidAt });
    if (invoice.paymentId) rows.push({ tenantRef: tenantId, provider, kind: "payment", resourceId: invoice.paymentId });
  }
  const attempts = await tx.select().from(billingPaymentAttempts).where(eq(billingPaymentAttempts.tenantId, tenantId));
  const invoiceProvider = new Map(invoices.map((invoice) => [invoice.id, providerOf.get(invoice.subscriptionId) ?? "mercadopago"]));
  for (const attempt of attempts) {
    rows.push({ tenantRef: tenantId, provider: invoiceProvider.get(attempt.invoiceId) ?? "mercadopago", kind: "payment", resourceId: attempt.paymentId });
  }
  const charges = await tx.select().from(billingCharges).where(eq(billingCharges.tenantId, tenantId));
  for (const charge of charges) {
    if (!charge.providerPaymentId) continue;
    const paid = charge.status === "approved" && charge.paidAt !== null;
    rows.push({ tenantRef: tenantId, provider: asProvider(charge.provider), kind: "charge", resourceId: charge.providerPaymentId, amountCents: paid ? charge.amountCents : null, paidAt: paid ? charge.paidAt : null });
  }
  if (rows.length === 0) return 0;
  await tx.insert(deletedTenantBilling).values(rows).onConflictDoNothing();
  return rows.length;
}
