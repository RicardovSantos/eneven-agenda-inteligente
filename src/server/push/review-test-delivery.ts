import { and, eq } from "drizzle-orm";
import { auditLog, pushDeliveries } from "@/db/schema";
import type { Db } from "@/db/types";

/** O chamador deve verificar que actorUserId é superadministrador. */
export async function reviewTestDelivery(db: Db, id: string, actorUserId: string, decision: "confirmed" | "retry", now = new Date()): Promise<void> {
  if (process.env.NODE_ENV === "production") throw new Error("Revisão indisponível em produção.");
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id) || !Number.isFinite(now.getTime()) || !["confirmed", "retry"].includes(decision)) throw new Error("Dados inválidos.");
  await db.transaction(async (tx) => {
    const [delivery] = await tx.select().from(pushDeliveries).where(eq(pushDeliveries.id, id)).limit(1).for("update");
    if (!delivery || (delivery.status !== "uncertain" && (delivery.status !== "processing" || !delivery.claimedAt || now.getTime() - delivery.claimedAt.getTime() < 5 * 60_000))) throw new Error("Ocorrência indisponível.");
    const changed = await tx.update(pushDeliveries).set(decision === "retry" ? { status: "pending", claimedAt: null, completedAt: null } : { status: "sent", completedAt: now }).where(and(eq(pushDeliveries.id, id), eq(pushDeliveries.status, delivery.status))).returning({ id: pushDeliveries.id });
    if (!changed.length) throw new Error("Ocorrência indisponível.");
    await tx.insert(auditLog).values({ tenantId: delivery.tenantId, actorUserId, action: "push.test_delivery_reviewed", details: { deliveryId: id, decision } });
  });
}
