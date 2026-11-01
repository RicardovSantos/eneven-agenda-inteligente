import { and, asc, eq, gt, inArray, lte, notExists } from "drizzle-orm";
import { billingSubscriptions, tenants, trialNotices } from "@/db/schema";
import type { Db } from "@/db/types";

const DAY = 86_400_000;
/** Aviso "termina em breve": nos últimos 3 dias do teste. */
const ENDING_WINDOW_MS = 3 * DAY;
/** Aviso "terminou": só para quem acabou de terminar, para não escrever a testes antigos e abandonados. */
const ENDED_WINDOW_MS = 3 * DAY;
/** Quem já começou a assinar não recebe aviso de teste. */
const STARTED_PAYING = ["creating", "uncertain", "pending", "authorized", "paused"];

export type TrialNoticeKind = "ending" | "ended";

/**
 * Reserva antes do envio, um aviso de cada tipo por estabelecimento; uma falha incerta
 * fica registrada e não é repetida sozinha. `send` recebe o fim do teste para o texto.
 */
export async function processTrialNotices(
  db: Db,
  send: (tenantId: string, kind: TrialNoticeKind, trialEndsAt: Date) => Promise<void>,
  { now = new Date(), limit = 50 }: { now?: Date; limit?: number } = {},
): Promise<{ sent: number; uncertain: number }> {
  if (!Number.isFinite(now.getTime())) throw new Error("Data inválida.");
  const result = { sent: 0, uncertain: 0 };
  const max = Math.max(0, Math.min(200, Math.floor(limit)));
  for (const kind of ["ending", "ended"] as const) {
    if (result.sent + result.uncertain >= max) break;
    const window = kind === "ending"
      ? and(gt(tenants.trialEndsAt, now), lte(tenants.trialEndsAt, new Date(now.getTime() + ENDING_WINDOW_MS)))
      : and(lte(tenants.trialEndsAt, now), gt(tenants.trialEndsAt, new Date(now.getTime() - ENDED_WINDOW_MS)));
    const candidates = await db.select({ id: tenants.id, trialEndsAt: tenants.trialEndsAt }).from(tenants)
      .where(and(
        eq(tenants.status, "trial"),
        window,
        notExists(db.select({ id: trialNotices.id }).from(trialNotices).where(and(eq(trialNotices.tenantId, tenants.id), eq(trialNotices.kind, kind)))),
        notExists(db.select({ id: billingSubscriptions.id }).from(billingSubscriptions).where(and(eq(billingSubscriptions.tenantId, tenants.id), inArray(billingSubscriptions.providerStatus, STARTED_PAYING)))),
      ))
      .orderBy(asc(tenants.trialEndsAt), asc(tenants.id)).limit(max);
    for (const candidate of candidates) {
      const reserved = await db.transaction(async (tx) => {
        const [tenant] = await tx.select({ status: tenants.status, trialEndsAt: tenants.trialEndsAt }).from(tenants).where(eq(tenants.id, candidate.id)).limit(1).for("update");
        if (!tenant || tenant.status !== "trial" || tenant.trialEndsAt.getTime() !== candidate.trialEndsAt.getTime()) return null;
        const [notice] = await tx.insert(trialNotices).values({ tenantId: candidate.id, kind, createdAt: now }).onConflictDoNothing().returning({ id: trialNotices.id });
        return notice ?? null;
      });
      if (!reserved) continue;
      let state: "sent" | "uncertain";
      try { await send(candidate.id, kind, candidate.trialEndsAt); state = "sent"; } catch { state = "uncertain"; }
      await db.update(trialNotices).set({ state, completedAt: now }).where(and(eq(trialNotices.id, reserved.id), eq(trialNotices.state, "sending")));
      result[state]++;
    }
  }
  return result;
}
