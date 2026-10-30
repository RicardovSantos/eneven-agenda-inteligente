import { and, asc, eq, isNull, lte } from "drizzle-orm";
import { pushDeliveries, pushEvents, pushSubscriptions } from "@/db/schema";
import type { Db } from "@/db/types";
import { sendTestPush } from "./test-transport";
import { pushSubscriptionVersion } from "./subscription-version";

type PushType = "booking_created" | "booking_canceled" | "booking_rescheduled";
type Sender = (input: unknown, type: PushType) => Promise<"sent" | "expired">;

/** Teste: reserva antes de enviar e mantém casos incertos sem nova tentativa automática. */
export async function processTestPushQueue(db: Db, sender: Sender, now = new Date(), limit = 20) {
  if (process.env.NODE_ENV === "production") throw new Error("Fila de teste indisponível em produção.");
  if (!Number.isFinite(now.getTime())) throw new Error("Data inválida.");
  const max = Number.isFinite(limit) ? Math.min(100, Math.max(0, Math.floor(limit))) : 0;
  const result = { expanded: 0, sent: 0, expired: 0, uncertain: 0 };
  for (let i = 0; i < max; i++) {
    const expanded = await db.transaction(async (tx) => {
      const [event] = await tx.select().from(pushEvents).where(and(isNull(pushEvents.expandedAt), lte(pushEvents.createdAt, now)))
        .orderBy(asc(pushEvents.createdAt), asc(pushEvents.id)).limit(1).for("update", { skipLocked: true });
      if (!event) return false;
      // Um dispositivo recém-cadastrado não recebe eventos anteriores à inscrição.
      const subscriptions = await tx.select({ id: pushSubscriptions.id }).from(pushSubscriptions)
        .where(and(eq(pushSubscriptions.tenantId, event.tenantId), lte(pushSubscriptions.createdAt, event.createdAt)));
      if (subscriptions.length) await tx.insert(pushDeliveries).values(subscriptions.map((subscription) => ({ tenantId: event.tenantId, eventId: event.id, subscriptionId: subscription.id, createdAt: now }))).onConflictDoNothing();
      await tx.update(pushEvents).set({ expandedAt: now }).where(eq(pushEvents.id, event.id));
      return true;
    });
    if (!expanded) break;
    result.expanded++;
  }
  for (let i = 0; i < max; i++) {
    const claimed = await db.transaction(async (tx) => {
      const [delivery] = await tx.select().from(pushDeliveries).where(eq(pushDeliveries.status, "pending"))
        .orderBy(asc(pushDeliveries.createdAt), asc(pushDeliveries.id)).limit(1).for("update", { skipLocked: true });
      if (!delivery) return null;
      const [event] = await tx.select().from(pushEvents).where(and(eq(pushEvents.id, delivery.eventId), eq(pushEvents.tenantId, delivery.tenantId))).limit(1);
      const [subscription] = await tx.select().from(pushSubscriptions).where(and(eq(pushSubscriptions.id, delivery.subscriptionId), eq(pushSubscriptions.tenantId, delivery.tenantId))).limit(1);
      if (!event || !subscription) throw new Error("Entrega indisponível.");
      await tx.update(pushDeliveries).set({ status: "processing", claimedAt: now, subscriptionVersion: pushSubscriptionVersion(subscription), expirationReason: null }).where(eq(pushDeliveries.id, delivery.id));
      return { delivery, event, subscription };
    });
    if (!claimed) break;
    let status: "sent" | "expired" | "uncertain";
    let expirationReason: "event_old" | "subscription_gone" | null = null;
    try {
      if (now.getTime() - claimed.event.createdAt.getTime() > 5 * 60_000) { status = "expired"; expirationReason = "event_old"; }
      else {
        status = await sender({ endpoint: claimed.subscription.endpoint, keys: { p256dh: claimed.subscription.p256dh, auth: claimed.subscription.auth } }, claimed.event.eventType as PushType);
        if (status === "expired") expirationReason = "subscription_gone";
      }
    } catch { status = "uncertain"; }
    const updated = await db.update(pushDeliveries).set({ status, expirationReason, completedAt: now }).where(and(eq(pushDeliveries.id, claimed.delivery.id), eq(pushDeliveries.status, "processing"), eq(pushDeliveries.claimedAt, now))).returning({ id: pushDeliveries.id });
    if (updated.length) result[status]++;
  }
  return result;
}

export function testPushSender(vapid: { subject: string; publicKey: string; privateKey: string }): Sender {
  return (subscription, type) => sendTestPush(subscription, type, vapid);
}
