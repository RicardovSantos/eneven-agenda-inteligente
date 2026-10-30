import { createHash } from "node:crypto";

/** Identifica a versão exata da inscrição sem expor os seus dados. */
export function pushSubscriptionVersion(subscription: { id: string; endpoint: string; p256dh: string; auth: string; updatedAt: Date }): string {
  return createHash("sha256").update(JSON.stringify([subscription.id, subscription.endpoint, subscription.p256dh, subscription.auth, subscription.updatedAt.toISOString()])).digest("hex");
}
