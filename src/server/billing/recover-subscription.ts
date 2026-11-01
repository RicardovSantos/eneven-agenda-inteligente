import { and, eq, inArray, isNull, lte, or } from "drizzle-orm";
import { auditLog, billingSubscriptions } from "@/db/schema";
import type { Db } from "@/db/types";
import { fetchMercadoPagoResource } from "./mercado-pago-client";
import { assertBillingConfig, liveBillingEnabled } from "./mode";
import { assertSandboxAccount } from "./sandbox";
import { validatePendingSubscription } from "./subscription-validation";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Apenas operador superadministrador autenticado. */
export async function recoverSubscription(db: Db, input: {
  subscriptionId: string; providerId: string; actorUserId: string;
}, config: { accessToken: string; collectorId: string; live?: boolean; fetcher?: typeof fetch }, now = new Date()): Promise<void> {
  if (!config.collectorId) throw new Error("Cobrança não configurada.");
  assertBillingConfig(config);
  if (!config.live) await assertSandboxAccount(config.accessToken, config.collectorId, config.fetcher);
  if (!UUID.test(input.subscriptionId) || !UUID.test(input.actorUserId) || !Number.isFinite(now.getTime())) throw new Error("Dados inválidos.");
  const [subscription] = await db.select().from(billingSubscriptions).where(eq(billingSubscriptions.id, input.subscriptionId)).limit(1);
  if (!subscription || !["creating", "uncertain"].includes(subscription.providerStatus) || subscription.priceCents === null || (subscription.providerStatus === "creating" && now.getTime() - subscription.createdAt.getTime() < 5 * 60_000)) throw new Error("Ocorrência indisponível.");
  const remote = await fetchMercadoPagoResource("subscription_preapproval", input.providerId, config.accessToken, config.fetcher);
  const verified = validatePendingSubscription(remote, { reference: subscription.id, collectorId: config.collectorId, priceCents: subscription.priceCents });
  await db.transaction(async (tx) => {
    const updated = await tx.update(billingSubscriptions).set({ providerId: verified.id, providerStatus: "pending", checkoutUrl: verified.checkoutUrl })
      .where(and(eq(billingSubscriptions.id, subscription.id), inArray(billingSubscriptions.providerStatus, ["creating", "uncertain"]))).returning({ id: billingSubscriptions.id });
    if (updated.length !== 1) throw new Error("Ocorrência já foi resolvida.");
    await tx.insert(auditLog).values({ actorUserId: input.actorUserId, tenantId: subscription.tenantId, action: "billing.subscription_recovered", details: { subscriptionId: subscription.id, providerId: verified.id } });
  });
}

/** O operador confirma ausência no provedor; esta operação não cancela assinatura remota. */
export async function abandonTestSubscription(db: Db, subscriptionId: string, actorUserId: string, now = new Date()): Promise<void> {
  if (process.env.NODE_ENV === "production" && !liveBillingEnabled()) throw new Error("Indisponível em produção.");
  if (!UUID.test(subscriptionId) || !UUID.test(actorUserId) || !Number.isFinite(now.getTime())) throw new Error("Dados inválidos.");
  const stale = new Date(now.getTime() - 5 * 60_000);
  await db.transaction(async (tx) => {
    const updated = await tx.update(billingSubscriptions).set({ providerStatus: "abandoned" })
      .where(and(eq(billingSubscriptions.id, subscriptionId), isNull(billingSubscriptions.providerId), or(eq(billingSubscriptions.providerStatus, "uncertain"), and(eq(billingSubscriptions.providerStatus, "creating"), lte(billingSubscriptions.createdAt, stale)))))
      .returning({ id: billingSubscriptions.id, tenantId: billingSubscriptions.tenantId });
    if (!updated.length) throw new Error("Ocorrência indisponível.");
    await tx.insert(auditLog).values({ actorUserId, tenantId: updated[0].tenantId, action: "billing.subscription_abandoned", details: { subscriptionId } });
  });
}
