import { eq } from "drizzle-orm";
import { billingInvoices } from "@/db/schema";
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
    const [invoice] = await tx.select().from(billingInvoices).where(eq(billingInvoices.id, reference)).limit(1).for("update");
    if (!invoice || (invoice.paymentId && invoice.paymentId !== paymentId) || !verifyPaymentOwnership(payment, {
      paymentId, externalReference: invoice.id, collectorId: config.collectorId, amountCents: invoice.amountCents, liveMode: config.liveMode,
    })) throw new Error("Pagamento não corresponde à fatura.");
    if (invoice.providerUpdatedAt && invoice.providerUpdatedAt >= updatedAt) return "unchanged";
    await tx.update(billingInvoices).set({ paymentId, providerStatus: payment.status as string, providerUpdatedAt: updatedAt, paidAt }).where(eq(billingInvoices.id, invoice.id));
    return "updated";
  });
}
