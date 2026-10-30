import { eq } from "drizzle-orm";
import { billingInvoicePaymentLinks, billingInvoices, billingSubscriptions } from "@/db/schema";
import type { Db } from "@/db/types";
import { fetchMercadoPagoResource } from "./mercado-pago-client";
import { validateSubscriptionIdentity } from "./subscription-validation";

/** Cria vínculo entre fatura do provedor, assinatura local e tentativa; não marca paga. */
export async function reconcileAuthorizedInvoice(db: Db, providerInvoiceId: string, config: {
  accessToken: string; collectorId: string; liveMode: boolean; fetcher?: typeof fetch;
}): Promise<{ paymentId: string | null }> {
  const remote = await fetchMercadoPagoResource("subscription_authorized_payment", providerInvoiceId, config.accessToken, config.fetcher);
  if (typeof remote.preapproval_id !== "string" || typeof remote.last_modified !== "string" || typeof remote.debit_date !== "string") throw new Error("Fatura inválida.");
  const timestamp = new Date(remote.last_modified);
  const dueAt = new Date(remote.debit_date);
  if (!Number.isFinite(timestamp.getTime()) || !Number.isFinite(dueAt.getTime())) throw new Error("Datas inválidas.");
  const [existingSubscription] = await db.select().from(billingSubscriptions).where(eq(billingSubscriptions.providerId, remote.preapproval_id)).limit(1);
  if (!existingSubscription || existingSubscription.priceCents === null) throw new Error("Assinatura não vinculada.");
  const preapproval = await fetchMercadoPagoResource("subscription_preapproval", remote.preapproval_id, config.accessToken, config.fetcher);
  if (typeof preapproval.live_mode === "boolean" && preapproval.live_mode !== config.liveMode) throw new Error("Ambiente inválido.");
  validateSubscriptionIdentity(preapproval, { reference: existingSubscription.id, collectorId: config.collectorId, priceCents: existingSubscription.priceCents });
  if (remote.external_reference !== existingSubscription.id || remote.currency_id !== "BRL") throw new Error("Fatura não corresponde à assinatura.");
  const amount = remote.transaction_amount;
  if ((typeof amount !== "number" && (typeof amount !== "string" || !/^\d+(?:\.\d{1,2})?$/.test(amount))) || !Number.isFinite(Number(amount)) || Math.abs(Number(amount) * 100 - existingSubscription.priceCents) > 1e-7) throw new Error("Valor de fatura inválido.");
  let paymentId: string | null = null;
  if (remote.payment !== undefined && remote.payment !== null) {
    if (typeof remote.payment !== "object" || Array.isArray(remote.payment)) throw new Error("Pagamento inválido.");
    const id = (remote.payment as Record<string, unknown>).id;
    if (id !== undefined && id !== null) {
      if ((typeof id !== "string" && (typeof id !== "number" || !Number.isSafeInteger(id))) || !/^\d{1,40}$/.test(String(id))) throw new Error("Pagamento inválido.");
      paymentId = String(id);
    }
  }
  await db.transaction(async (tx) => {
    const [subscription] = await tx.select().from(billingSubscriptions).where(eq(billingSubscriptions.id, existingSubscription.id)).limit(1).for("update");
    if (!subscription || subscription.providerId !== remote.preapproval_id || subscription.priceCents !== existingSubscription.priceCents) throw new Error("Assinatura alterada.");
    const [found] = await tx.select().from(billingInvoices).where(eq(billingInvoices.providerId, providerInvoiceId)).limit(1).for("update");
    if (found && (found.subscriptionId !== subscription.id || found.tenantId !== subscription.tenantId || found.amountCents !== subscription.priceCents)) throw new Error("Fatura vinculada a outro estabelecimento.");
    if (found?.invoiceUpdatedAt && found.invoiceUpdatedAt > timestamp) throw new Error("Fatura desatualizada.");
    let invoice = found;
    if (!invoice) {
      [invoice] = await tx.insert(billingInvoices).values({ tenantId: subscription.tenantId, subscriptionId: subscription.id, providerId: providerInvoiceId, providerStatus: "pending", amountCents: subscription.priceCents!, dueAt, invoiceUpdatedAt: timestamp }).returning();
    } else if (!invoice.invoiceUpdatedAt || invoice.invoiceUpdatedAt < timestamp) {
      await tx.update(billingInvoices).set({ dueAt, invoiceUpdatedAt: timestamp }).where(eq(billingInvoices.id, invoice.id));
    }
    if (paymentId) {
      const [link] = await tx.select().from(billingInvoicePaymentLinks).where(eq(billingInvoicePaymentLinks.paymentId, paymentId)).limit(1);
      if (link && (link.invoiceId !== invoice.id || link.tenantId !== invoice.tenantId)) throw new Error("Pagamento vinculado a outra fatura.");
      if (!link && found?.invoiceUpdatedAt && found.invoiceUpdatedAt.getTime() === timestamp.getTime()) throw new Error("Fatura ambígua.");
      if (!link) await tx.insert(billingInvoicePaymentLinks).values({ paymentId, tenantId: invoice.tenantId, invoiceId: invoice.id });
    }
    // Nenhum status vindo da fatura substitui a consulta individual do pagamento.
  });
  return { paymentId };
}
