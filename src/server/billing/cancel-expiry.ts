import { and, eq, inArray, isNotNull, lte, notExists } from "drizzle-orm";
import { alias } from "drizzle-orm/pg-core";
import { auditLog, billingSubscriptions, tenants } from "@/db/schema";
import type { Db } from "@/db/types";

const GRACE_MS = 7 * 86_400_000;
/** Assinaturas que ainda cobram (ou podem cobrar): enquanto existir uma, o cancelamento antigo não vale. */
const LIVE_STATUSES = ["creating", "uncertain", "pending", "authorized", "paused"];

/**
 * Fim do período pago de uma assinatura cancelada: o estabelecimento passa a "em atraso"
 * com a carência já vencida (`pastDueAt` = fim do período − 7 dias), o que é o mesmo
 * estado de bloqueio da falta de pagamento: a página pública sai do ar e o painel fica
 * sem novos horários. Assinar de novo e pagar reativa sozinho. Não mexe em quem foi
 * bloqueado ou cancelado à mão, nem em quem já tem outra assinatura ativa.
 */
export async function applyCancelledExpiry(db: Db, now = new Date()): Promise<{ expired: number }> {
  if (!Number.isFinite(now.getTime())) throw new Error("Data inválida.");
  const other = alias(billingSubscriptions, "other_subscription");
  const candidates = await db.select({ id: billingSubscriptions.id, tenantId: billingSubscriptions.tenantId, accessUntil: billingSubscriptions.accessUntil })
    .from(billingSubscriptions).innerJoin(tenants, eq(tenants.id, billingSubscriptions.tenantId))
    .where(and(
      eq(billingSubscriptions.providerStatus, "cancelled"),
      isNotNull(billingSubscriptions.accessUntil),
      lte(billingSubscriptions.accessUntil, now),
      eq(tenants.status, "active"),
      notExists(db.select({ id: other.id }).from(other).where(and(eq(other.tenantId, billingSubscriptions.tenantId), inArray(other.providerStatus, LIVE_STATUSES)))),
    )).limit(100);
  let expired = 0;
  for (const candidate of candidates) {
    const changed = await db.transaction(async (tx) => {
      const [tenant] = await tx.select({ status: tenants.status }).from(tenants).where(eq(tenants.id, candidate.tenantId)).limit(1).for("update");
      if (!tenant || tenant.status !== "active") return false;
      const stillLive = await tx.select({ id: billingSubscriptions.id }).from(billingSubscriptions)
        .where(and(eq(billingSubscriptions.tenantId, candidate.tenantId), inArray(billingSubscriptions.providerStatus, LIVE_STATUSES))).limit(1);
      if (stillLive.length) return false;
      const pastDueAt = new Date(candidate.accessUntil!.getTime() - GRACE_MS);
      await tx.update(tenants).set({ status: "past_due", pastDueAt }).where(eq(tenants.id, candidate.tenantId));
      await tx.insert(auditLog).values({ tenantId: candidate.tenantId, action: "billing.cancel_effective", details: { subscriptionId: candidate.id, accessUntil: candidate.accessUntil!.toISOString() } });
      return true;
    });
    if (changed) expired++;
  }
  return { expired };
}
