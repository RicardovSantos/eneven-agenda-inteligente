import { createHash } from "node:crypto";
import { and, eq } from "drizzle-orm";
import { memberships, pushSubscriptions } from "@/db/schema";
import type { Db } from "@/db/types";
import { validatePushSubscription } from "./validate-subscription";

type Actor = { userId: string; tenantId: string; support: boolean };
const endpointHash = (endpoint: string) => createHash("sha256").update(endpoint).digest("hex");

/** Actor deve vir da sessão autenticada, nunca do cliente. */
export async function savePushSubscription(db: Db, actor: Actor, input: unknown): Promise<void> {
  if (actor.support) throw new Error("Notificações indisponíveis em modo suporte.");
  const subscription = validatePushSubscription(input);
  await db.transaction(async (tx) => {
    const [membership] = await tx.select({ userId: memberships.userId }).from(memberships).where(and(eq(memberships.userId, actor.userId), eq(memberships.tenantId, actor.tenantId))).limit(1).for("update");
    if (!membership) throw new Error("Acesso indisponível.");
    const rows = await tx.insert(pushSubscriptions).values({ tenantId: actor.tenantId, userId: actor.userId, endpointHash: endpointHash(subscription.endpoint), ...subscription })
      .onConflictDoUpdate({ target: pushSubscriptions.endpointHash, set: { p256dh: subscription.p256dh, auth: subscription.auth, updatedAt: new Date() }, setWhere: and(eq(pushSubscriptions.tenantId, actor.tenantId), eq(pushSubscriptions.userId, actor.userId)) }).returning({ id: pushSubscriptions.id });
    if (!rows.length) throw new Error("Inscrição indisponível.");
  });
}

export async function removePushSubscription(db: Db, actor: Actor, input: unknown): Promise<void> {
  if (actor.support) throw new Error("Notificações indisponíveis em modo suporte.");
  const subscription = validatePushSubscription(input);
  await db.delete(pushSubscriptions).where(and(eq(pushSubscriptions.tenantId, actor.tenantId), eq(pushSubscriptions.userId, actor.userId), eq(pushSubscriptions.endpointHash, endpointHash(subscription.endpoint))));
}
