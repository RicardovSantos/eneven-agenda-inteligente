import { and, eq } from "drizzle-orm";
import { auditLog, billingNotices } from "@/db/schema";
import type { Db } from "@/db/types";
import { liveBillingEnabled } from "./mode";

/** O chamador deve conferir que o usuário é superadministrador. */
export async function reviewTestNotice(db: Db, id: string, actorUserId: string, decision: "confirmed" | "retry", now = new Date()): Promise<void> {
  if (process.env.NODE_ENV === "production" && !liveBillingEnabled()) throw new Error("Revisão indisponível em produção.");
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id) || !Number.isFinite(now.getTime()) || !["confirmed", "retry"].includes(decision)) throw new Error("Dados inválidos.");
  await db.transaction(async (tx) => {
    const [notice] = await tx.select().from(billingNotices).where(eq(billingNotices.id, id)).limit(1).for("update");
    if (!notice || (notice.state !== "uncertain" && (notice.state !== "sending" || now.getTime() - notice.createdAt.getTime() < 5 * 60_000))) throw new Error("Ocorrência indisponível.");
    if (decision === "confirmed") await tx.update(billingNotices).set({ state: "sent", completedAt: now }).where(and(eq(billingNotices.id, id), eq(billingNotices.state, notice.state)));
    else await tx.delete(billingNotices).where(and(eq(billingNotices.id, id), eq(billingNotices.state, notice.state)));
    await tx.insert(auditLog).values({ actorUserId, tenantId: notice.tenantId, action: "billing.test_notice_reviewed", details: { noticeId: id, decision } });
  });
}
