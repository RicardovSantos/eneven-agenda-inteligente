import { and, eq, inArray } from "drizzle-orm";
import { auditLog, billingSubscriptions } from "@/db/schema";
import type { Db } from "@/db/types";
import { fetchMercadoPagoResource } from "./mercado-pago-client";
import { validatePendingSubscription } from "./subscription-validation";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Apenas operador superadministrador autenticado; disponível somente em teste. */
export async function recoverTestSubscription(db: Db, input: {
  subscriptionId: string; providerId: string; actorUserId: string;
}, config: { accessToken: string; collectorId: string; fetcher?: typeof fetch }, now = new Date()): Promise<void> {
  if (process.env.NODE_ENV === "production" || !config.accessToken.startsWith("TEST-") || !config.collectorId) throw new Error("Cobrança de teste não configurada.");
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
