import { and, between, eq, isNull, notExists } from "drizzle-orm";
import { billingInvoicePaymentLinks, billingInvoices, billingPaymentAttempts } from "@/db/schema";
import type { Db } from "@/db/types";
import { fetchMercadoPagoResource } from "./mercado-pago-client";
import { verifyPaymentOwnership } from "./verify-payment";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const STATES = new Set(["pending", "in_process", "approved", "rejected", "cancelled", "refunded", "charged_back"]);
/** Folga entre o vencimento da fatura e a criação do pagamento da mesma tentativa de cobrança. */
const ADOPT_WINDOW_MS = 15 * 60_000;

type Tx = Parameters<Parameters<Db["transaction"]>[0]>[0];

/**
 * A Mercado Pago às vezes avisa da cobrança antes de anexar o pagamento a ela; a fatura então
 * nasce sem ligação com o pagamento e o aviso do pagamento (cuja referência é a assinatura)
 * não achava a que fatura pertence. Aqui, e só quando não há ligação nem fatura com esse id,
 * aceita a ÚNICA fatura da mesma assinatura, do mesmo valor, ainda sem pagamento ligado e com
 * vencimento a até 15 minutos da criação do pagamento. Zero ou mais de uma: não adivinha.
 */
async function findUnlinkedInvoice(tx: Tx, subscriptionId: string, payment: Record<string, unknown>) {
  if (typeof payment.date_created !== "string" || typeof payment.transaction_amount !== "number") return null;
  const created = new Date(payment.date_created);
  const cents = Math.round(payment.transaction_amount * 100);
  if (!Number.isFinite(created.getTime()) || !Number.isSafeInteger(cents) || cents <= 0) return null;
  const candidates = await tx.select().from(billingInvoices)
    .where(and(
      eq(billingInvoices.subscriptionId, subscriptionId),
      eq(billingInvoices.amountCents, cents),
      isNull(billingInvoices.paymentId),
      between(billingInvoices.dueAt, new Date(created.getTime() - ADOPT_WINDOW_MS), new Date(created.getTime() + ADOPT_WINDOW_MS)),
      notExists(tx.select({ id: billingInvoicePaymentLinks.paymentId }).from(billingInvoicePaymentLinks).where(eq(billingInvoicePaymentLinks.invoiceId, billingInvoices.id))),
    ))
    .limit(2).for("update");
  return candidates.length === 1 ? candidates[0] : null;
}

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
    let [invoice] = await tx.select().from(billingInvoices).where(eq(billingInvoices.id, link?.invoiceId ?? reference)).limit(1).for("update");
    let adopted = false;
    if (!link && !invoice) {
      const found = await findUnlinkedInvoice(tx, reference, payment);
      if (found) { invoice = found; adopted = true; }
    }
    if (link && (!invoice || link.tenantId !== invoice.tenantId || (reference !== invoice.id && reference !== invoice.subscriptionId))) throw new Error("Pagamento não corresponde à fatura.");
    if (adopted && invoice.subscriptionId !== reference) throw new Error("Pagamento não corresponde à fatura.");
    if (!invoice || !verifyPaymentOwnership(payment, {
      paymentId, externalReference: reference, collectorId: config.collectorId, amountCents: invoice.amountCents, liveMode: config.liveMode,
    })) throw new Error("Pagamento não corresponde à fatura.");
    const [prior] = await tx.select().from(billingPaymentAttempts).where(eq(billingPaymentAttempts.paymentId, paymentId)).limit(1);
    if (prior && (prior.tenantId !== invoice.tenantId || prior.invoiceId !== invoice.id)) throw new Error("Pagamento vinculado a outra fatura.");
    if (prior && prior.providerUpdatedAt >= updatedAt) {
      if (prior.providerUpdatedAt.getTime() === updatedAt.getTime() && (prior.status !== payment.status || (prior.paidAt?.getTime() ?? null) !== (paidAt?.getTime() ?? null))) throw new Error("Atualização de pagamento ambígua.");
      return "unchanged";
    }
    if (adopted) await tx.insert(billingInvoicePaymentLinks).values({ paymentId, tenantId: invoice.tenantId, invoiceId: invoice.id }).onConflictDoNothing();
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
