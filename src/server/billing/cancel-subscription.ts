import { and, eq } from "drizzle-orm";
import { auditLog, billingInvoices, billingSubscriptions, memberships } from "@/db/schema";
import type { Db } from "@/db/types";
import { assertBillingConfig } from "./mode";
import { paidThrough } from "./paid-through";
import { assertSandboxAccount } from "./sandbox";
import { validateSubscriptionIdentity } from "./subscription-validation";

/**
 * Cancela a assinatura do estabelecimento a pedido do dono. O acesso continua até o
 * fim do período já pago (`accessUntil`) e não há reembolso. O pedido à Mercado Pago
 * vem primeiro: se ele falhar nada muda aqui, e se o resultado for incerto o webhook
 * da assinatura (`cancelled`) sincroniza o estado depois.
 */
export async function cancelSubscription(db: Db, input: { tenantId: string; ownerUserId: string }, config: {
  accessToken: string; collectorId: string; live?: boolean; fetcher?: typeof fetch;
}, now = new Date()): Promise<{ accessUntil: Date | null }> {
  if (!config.collectorId) throw new Error("Cobrança não configurada.");
  assertBillingConfig(config);
  if (!config.live) await assertSandboxAccount(config.accessToken, config.collectorId, config.fetcher);

  const [member] = await db.select({ role: memberships.role }).from(memberships)
    .where(and(eq(memberships.tenantId, input.tenantId), eq(memberships.userId, input.ownerUserId))).limit(1);
  if (!member || member.role !== "owner") throw new Error("Acesso indisponível.");

  const [subscription] = await db.select().from(billingSubscriptions)
    .where(and(eq(billingSubscriptions.tenantId, input.tenantId), eq(billingSubscriptions.providerStatus, "authorized"))).limit(1);
  if (!subscription || !subscription.providerId || subscription.priceCents === null) throw new Error("Não há assinatura ativa para cancelar.");
  if (!/^[A-Za-z0-9_-]{1,200}$/.test(subscription.providerId)) throw new Error("Assinatura inválida.");

  const response = await (config.fetcher ?? fetch)(`https://api.mercadopago.com/preapproval/${encodeURIComponent(subscription.providerId)}`, {
    method: "PUT", redirect: "error", signal: AbortSignal.timeout(10_000),
    headers: { Authorization: `Bearer ${config.accessToken}`, "Content-Type": "application/json", Accept: "application/json" },
    body: JSON.stringify({ status: "cancelled" }),
  });
  if (!response.ok) throw new Error("Não foi possível cancelar agora. Tente novamente em instantes.");
  const remote: unknown = await response.json();
  if (!remote || typeof remote !== "object" || Array.isArray(remote)) throw new Error("Resposta inválida.");
  const body = remote as Record<string, unknown>;
  validateSubscriptionIdentity(body, { reference: subscription.id, collectorId: config.collectorId, priceCents: subscription.priceCents });
  if (body.id !== subscription.providerId || body.status !== "cancelled") throw new Error("Cancelamento não confirmado.");

  return db.transaction(async (tx) => {
    const invoices = await tx.select({ providerStatus: billingInvoices.providerStatus, dueAt: billingInvoices.dueAt, paidAt: billingInvoices.paidAt })
      .from(billingInvoices).where(and(eq(billingInvoices.tenantId, input.tenantId), eq(billingInvoices.subscriptionId, subscription.id)));
    const accessUntil = paidThrough(invoices);
    await tx.update(billingSubscriptions).set({ providerStatus: "cancelled", providerUpdatedAt: now, accessUntil, checkoutUrl: null })
      .where(eq(billingSubscriptions.id, subscription.id));
    await tx.insert(auditLog).values({ actorUserId: input.ownerUserId, tenantId: input.tenantId, action: "billing.subscription_canceled", details: { subscriptionId: subscription.id, accessUntil: accessUntil?.toISOString() ?? null } });
    return { accessUntil };
  });
}
