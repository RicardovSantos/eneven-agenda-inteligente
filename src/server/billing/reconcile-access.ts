import { and, eq, inArray, ne } from "drizzle-orm";
import { auditLog, billingInvoices, billingPaymentAttempts, billingSubscriptions, tenants } from "@/db/schema";
import type { Db } from "@/db/types";
import { liveBillingEnabled } from "./mode";

/** Nunca desbloqueia bloqueio manual ou cancelamento da conta; só age no modo real em produção ou no sandbox fora dela. */
export async function reconcileBillingAccess(db: Db, tenantId: string, now = new Date()): Promise<"updated" | "unchanged" | "review"> {
  if (process.env.NODE_ENV === "production" && !liveBillingEnabled()) throw new Error("Conciliação indisponível em produção.");
  if (!Number.isFinite(now.getTime())) throw new Error("Data inválida.");
  return db.transaction(async (tx) => {
    const [tenant] = await tx.select().from(tenants).where(eq(tenants.id, tenantId)).limit(1).for("update");
    if (!tenant) throw new Error("Estabelecimento não encontrado.");
    // Bloqueios manuais e cancelamentos só podem ser alterados por ação explícita.
    if (tenant.status === "read_only" || tenant.status === "canceled") return "unchanged";
    const allSubscriptions = await tx.select().from(billingSubscriptions)
      .where(and(eq(billingSubscriptions.tenantId, tenantId), ne(billingSubscriptions.providerStatus, "abandoned"))).for("update");
    // Assinaturas canceladas não decidem o acesso: o fim do período pago é tratado em `applyCancelledExpiry`.
    const subscriptions = allSubscriptions.filter((item) => item.providerStatus !== "cancelled" && item.providerStatus !== "canceled");
    if (!subscriptions.length && allSubscriptions.length) return "unchanged";
    if (subscriptions.length !== 1 || subscriptions[0].planId !== tenant.planId || subscriptions[0].providerStatus !== "authorized" || !subscriptions[0].providerId || !subscriptions[0].providerUpdatedAt) return "review";
    const invoices = await tx.select().from(billingInvoices)
      .where(and(eq(billingInvoices.tenantId, tenantId), eq(billingInvoices.subscriptionId, subscriptions[0].id))).for("update");
    if (!invoices.length) return "unchanged";
    // Uma tentativa aprovada não deve esconder outro pagamento estornado ou contestado.
    const disputed = await tx.select({ paymentId: billingPaymentAttempts.paymentId }).from(billingPaymentAttempts)
      .where(and(eq(billingPaymentAttempts.tenantId, tenantId), inArray(billingPaymentAttempts.invoiceId, invoices.map((invoice) => invoice.id)), inArray(billingPaymentAttempts.status, ["refunded", "charged_back"]))).limit(1);
    if (disputed.length) return "review";
    // Não libera acesso com informação incompleta, devolução ou contestação.
    if (invoices.some((invoice) => !invoice.invoiceUpdatedAt || !invoice.dueAt || !["pending", "in_process", "rejected", "approved"].includes(invoice.providerStatus) || (invoice.providerStatus !== "pending" && (!invoice.paymentId || !invoice.providerUpdatedAt)) || (invoice.providerStatus === "approved" && !invoice.paidAt))) return "review";
    const overdue = invoices.filter((invoice) => invoice.providerStatus !== "approved" && invoice.dueAt!.getTime() <= now.getTime()).sort((a, b) => a.dueAt!.getTime() - b.dueAt!.getTime());
    let nextStatus: "active" | "past_due";
    let pastDueAt: Date | null;
    if (overdue.length) {
      // O teste gratuito não é encurtado por uma fatura pendente.
      if (tenant.status === "trial" && tenant.trialEndsAt > now) return "unchanged";
      nextStatus = "past_due";
      pastDueAt = new Date(Math.max(overdue[0].dueAt!.getTime(), tenant.trialEndsAt.getTime()));
    } else {
      if (!invoices.some((invoice) => invoice.providerStatus === "approved")) return "unchanged";
      nextStatus = "active";
      pastDueAt = null;
    }
    if (tenant.status === nextStatus && (tenant.pastDueAt?.getTime() ?? null) === (pastDueAt?.getTime() ?? null)) return "unchanged";
    await tx.update(tenants).set({ status: nextStatus, pastDueAt, ...(nextStatus === "active" ? { activatedAt: tenant.activatedAt ?? now } : {}) }).where(eq(tenants.id, tenantId));
    await tx.insert(auditLog).values({ tenantId, action: "billing.access_reconciled", details: { from: tenant.status, to: nextStatus } });
    return "updated";
  });
}
