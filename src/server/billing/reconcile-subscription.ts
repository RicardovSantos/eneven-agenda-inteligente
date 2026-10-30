import { eq } from "drizzle-orm";
import { billingSubscriptions } from "@/db/schema";
import type { Db } from "@/db/types";
import { fetchMercadoPagoResource } from "./mercado-pago-client";
import { validatePendingSubscription, validateSubscriptionIdentity } from "./subscription-validation";

const STATUSES = new Set(["pending", "authorized", "paused", "canceled"]);
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Atualiza apenas uma assinatura vinculada; não libera ou bloqueia acesso. */
export async function reconcileSubscription(db: Db, providerId: string, config: { accessToken: string; collectorId: string; fetcher?: typeof fetch }): Promise<"updated" | "unchanged"> {
  const remote = await fetchMercadoPagoResource("subscription_preapproval", providerId, config.accessToken, config.fetcher);
  if (typeof remote.external_reference !== "string" || !UUID.test(remote.external_reference) || typeof remote.status !== "string" || !STATUSES.has(remote.status) || typeof remote.last_modified !== "string") throw new Error("Assinatura inválida.");
  const reference = remote.external_reference;
  const timestamp = new Date(remote.last_modified);
  if (!Number.isFinite(timestamp.getTime())) throw new Error("Data inválida.");
  return db.transaction(async (tx) => {
    const [stored] = await tx.select().from(billingSubscriptions).where(eq(billingSubscriptions.id, reference)).limit(1).for("update");
    if (!stored || stored.providerId !== providerId || stored.priceCents === null || !["pending", "authorized", "paused", "canceled"].includes(stored.providerStatus)) throw new Error("Assinatura não vinculada.");
    validateSubscriptionIdentity(remote, { reference: stored.id, collectorId: config.collectorId, priceCents: stored.priceCents });
    if (stored.providerUpdatedAt && stored.providerUpdatedAt.getTime() >= timestamp.getTime()) {
      if (stored.providerUpdatedAt.getTime() === timestamp.getTime() && stored.providerStatus !== remote.status) throw new Error("Atualização ambígua.");
      return "unchanged";
    }
    const checkoutUrl = remote.status === "pending" ? validatePendingSubscription(remote, { reference: stored.id, collectorId: config.collectorId, priceCents: stored.priceCents }).checkoutUrl : null;
    await tx.update(billingSubscriptions).set({ providerStatus: remote.status as string, providerUpdatedAt: timestamp, checkoutUrl }).where(eq(billingSubscriptions.id, stored.id));
    return "updated";
  });
}
