import { and, asc, eq, gte, isNotNull } from "drizzle-orm";
import { billingSubscriptions } from "@/db/schema";
import type { Db } from "@/db/types";
import { reconcileSubscription } from "./reconcile-subscription";

const RECENT_MS = 7 * 86_400_000;

/**
 * Consulta na Mercado Pago as assinaturas que aqui ainda estão "pendentes" (link de pagamento
 * em aberto) e atualiza a situação delas. A Mercado Pago cancela a assinatura quando o primeiro
 * pagamento é recusado, e nem sempre avisa: sem esta consulta o painel continuaria oferecendo um
 * link que já não funciona ("Este plano não está disponível"). Só olha assinaturas criadas nos
 * últimos 7 dias, para não consultar para sempre links abandonados. Não altera o acesso.
 */
export async function refreshPendingSubscriptions(
  db: Db,
  config: { accessToken: string; collectorId: string; fetcher?: typeof fetch },
  options: { tenantId?: string; limit?: number; now?: Date } = {},
): Promise<{ updated: number; unchanged: number; failed: number }> {
  const now = options.now ?? new Date();
  const limit = Math.max(1, Math.min(100, Math.floor(options.limit ?? 50)));
  const rows = await db
    .select({ providerId: billingSubscriptions.providerId })
    .from(billingSubscriptions)
    .where(
      and(
        eq(billingSubscriptions.providerStatus, "pending"),
        isNotNull(billingSubscriptions.providerId),
        gte(billingSubscriptions.createdAt, new Date(now.getTime() - RECENT_MS)),
        options.tenantId ? eq(billingSubscriptions.tenantId, options.tenantId) : undefined,
      ),
    )
    .orderBy(asc(billingSubscriptions.createdAt))
    .limit(limit);
  const result = { updated: 0, unchanged: 0, failed: 0 };
  for (const { providerId } of rows) {
    try {
      result[await reconcileSubscription(db, providerId!, config)]++;
    } catch (error) {
      result.failed++;
      console.warn(`Assinatura pendente não atualizada (${providerId}): ${error instanceof Error ? error.message : "erro"}`);
    }
  }
  return result;
}
