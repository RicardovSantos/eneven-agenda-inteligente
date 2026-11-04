import { desc, eq } from "drizzle-orm";
import { billingInvoices, billingPaymentAttempts, billingSubscriptions } from "@/db/schema";
import type { Db } from "@/db/types";

export type TenantBillingIds = {
  subscriptions: Array<{
    /** Referência: o `external_reference` que vai à Mercado Pago (id da assinatura aqui dentro). */
    reference: string;
    /** Id da assinatura na Mercado Pago (`null` enquanto a criação não terminou). */
    mercadoPagoId: string | null;
    status: string;
    priceCents: number | null;
    createdAt: Date;
  }>;
  payments: Array<{
    paymentId: string;
    status: string;
    updatedAt: Date;
    invoiceProviderId: string | null;
    amountCents: number | null;
    dueAt: Date | null;
  }>;
};

/**
 * Os códigos que ligam um estabelecimento à cobrança: referência e id da assinatura na Mercado
 * Pago, e os pagamentos recebidos (inclusive os recusados). Não traz e-mail nem dados de cartão.
 * Só chame depois de `requireSuperAdminSession()`.
 */
export async function getTenantBillingIds(db: Db, tenantId: string): Promise<TenantBillingIds> {
  const subscriptions = await db
    .select({
      reference: billingSubscriptions.id,
      mercadoPagoId: billingSubscriptions.providerId,
      status: billingSubscriptions.providerStatus,
      priceCents: billingSubscriptions.priceCents,
      createdAt: billingSubscriptions.createdAt,
    })
    .from(billingSubscriptions)
    .where(eq(billingSubscriptions.tenantId, tenantId))
    .orderBy(desc(billingSubscriptions.createdAt))
    .limit(5);
  const payments = await db
    .select({
      paymentId: billingPaymentAttempts.paymentId,
      status: billingPaymentAttempts.status,
      updatedAt: billingPaymentAttempts.providerUpdatedAt,
      invoiceProviderId: billingInvoices.providerId,
      amountCents: billingInvoices.amountCents,
      dueAt: billingInvoices.dueAt,
    })
    .from(billingPaymentAttempts)
    .leftJoin(billingInvoices, eq(billingInvoices.id, billingPaymentAttempts.invoiceId))
    .where(eq(billingPaymentAttempts.tenantId, tenantId))
    .orderBy(desc(billingPaymentAttempts.providerUpdatedAt))
    .limit(8);
  return { subscriptions, payments };
}
