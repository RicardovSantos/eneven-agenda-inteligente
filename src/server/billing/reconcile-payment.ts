import { and, eq } from "drizzle-orm";
import { billingInvoicePaymentLinks, billingInvoices, billingPaymentAttempts } from "@/db/schema";
import type { Db } from "@/db/types";
import { fetchMercadoPagoResource } from "./mercado-pago-client";
import { verifyPaymentOwnership } from "./verify-payment";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const STATES = new Set(["pending", "in_process", "approved", "rejected", "cancelled", "refunded", "charged_back"]);

/** Concilia somente faturas já criadas na plataforma; não altera o acesso do tenant. */
export async function reconcilePayment(db: Db, paymentId: string, config: {
  accessToken: string; collectorId: string; liveMode: boolean; fetcher?: typeof fetch;
}): Promise<"updated" | "unchanged"> {
  const payment = await fetchMercadoPagoResource("payment", paymentId, config.accessToken, config.fetcher);
  const reference = payment.external_reference;
  if (typeof reference !== "string" || !UUID.test(reference)) throw new Error("Referência de fatura inválida.");
  if (typeof payment.status !== "string" || !STATES.has(payment.status)) throw new Error("Status de pagamento desconhecido.");
  if (typeof payment.date_last_updated !== "string") throw new Error("Data de atualização ausente.");
  const updatedAt = new Date(payment.date_last_updated);
  if (!Number.isFinite(updatedAt.getTime())) throw new Error("Data de atualização inválida.");
  let paidAt: Date | null = null;
  if (payment.status === "approved") {
    if (typeof payment.date_approved !== "string") throw new Error("Data de pagamento ausente.");
    paidAt = new Date(payment.date_approved);
    if (!Number.isFinite(paidAt.getTime())) throw new Error("Data de pagamento inválida.");
  }
  return db.transaction(async (tx) => {
    const [link] = await tx.select().from(billingInvoicePaymentLinks).where(eq(billingInvoicePaymentLinks.paymentId, paymentId)).limit(1);
    const [invoice] = await tx.select().from(billingInvoices).where(eq(billingInvoices.id, link?.invoiceId ?? reference)).limit(1).for("update");
    if (link && (!invoice || link.tenantId !== invoice.tenantId || (reference !== invoice.id && reference !== invoice.subscriptionId))) throw new Error("Pagamento não corresponde à fatura.");
    if (!invoice || !verifyPaymentOwnership(payment, {
      paymentId, externalReference: reference, collectorId: config.collectorId, amountCents: invoice.amountCents, liveMode: config.liveMode,
    })) throw new Error("Pagamento não corresponde à fatura.");
    const [prior] = await tx.select().from(billingPaymentAttempts).where(eq(billingPaymentAttempts.paymentId, paymentId)).limit(1);
    if (prior && (prior.tenantId !== invoice.tenantId || prior.invoiceId !== invoice.id)) throw new Error("Pagamento vinculado a outra fatura.");
    if (prior && prior.providerUpdatedAt >= updatedAt) {
      if (prior.providerUpdatedAt.getTime() === updatedAt.getTime() && (prior.status !== payment.status || (prior.paidAt?.getTime() ?? null) !== (paidAt?.getTime() ?? null))) throw new Error("Atualização de pagamento ambígua.");
      return "unchanged";
    }
    const values = { status: payment.status as string, providerUpdatedAt: updatedAt, paidAt };
    if (prior) await tx.update(billingPaymentAttempts).set(values).where(eq(billingPaymentAttempts.paymentId, paymentId));
    else await tx.insert(billingPaymentAttempts).values({ paymentId, tenantId: invoice.tenantId, invoiceId: invoice.id, ...values });
    const attempts = await tx.select().from(billingPaymentAttempts).where(and(eq(billingPaymentAttempts.tenantId, invoice.tenantId), eq(billingPaymentAttempts.invoiceId, invoice.id)));
    // Uma tentativa aprovada mantém a fatura paga mesmo se outra for recusada.
    attempts.sort((a, b) => Number(b.status === "approved") - Number(a.status === "approved") || b.providerUpdatedAt.getTime() - a.providerUpdatedAt.getTime() || a.paymentId.localeCompare(b.paymentId));
    const selected = attempts[0];
    await tx.update(billingInvoices).set({ paymentId: selected.paymentId, providerStatus: selected.status, providerUpdatedAt: selected.providerUpdatedAt, paidAt: selected.paidAt }).where(eq(billingInvoices.id, invoice.id));
    return "updated";
  });
}
