import { and, eq } from "drizzle-orm";
import { billingSubscriptions } from "@/db/schema";
import type { Db } from "@/db/types";
import { cancelSubscription } from "@/server/billing/cancel-subscription";
import { billingConfig } from "@/server/billing/mode";
import { getStripe } from "@/server/billing/stripe/client";
import { stripeConfig } from "@/server/billing/stripe/config";
import { cancelStripeSubscription } from "@/server/billing/stripe/manage";

/**
 * Encerra a assinatura recorrente ativa do estabelecimento no provedor em que ela nasceu, para a
 * cobrança não continuar depois da exclusão. Sem assinatura ativa não há nada a fazer. Com assinatura
 * ativa e provedor sem configuração, lança erro: apagar sem cancelar deixaria a cobrança rodando.
 */
export async function cancelTenantBilling(db: Db, input: { tenantId: string; ownerUserId: string }): Promise<void> {
  const [active] = await db
    .select({ provider: billingSubscriptions.provider })
    .from(billingSubscriptions)
    .where(and(eq(billingSubscriptions.tenantId, input.tenantId), eq(billingSubscriptions.providerStatus, "authorized")))
    .limit(1);
  if (!active) return;
  if (active.provider === "stripe") {
    const stripe = stripeConfig();
    if (!stripe) throw new Error("Cobrança não configurada.");
    await cancelStripeSubscription(db, input, getStripe(stripe));
    return;
  }
  const config = billingConfig();
  if (!config) throw new Error("Cobrança não configurada.");
  await cancelSubscription(db, input, config);
}
