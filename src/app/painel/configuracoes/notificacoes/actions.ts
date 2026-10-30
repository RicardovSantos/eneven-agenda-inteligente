"use server";

import { getDb } from "@/db/client";
import { requireOwner } from "@/server/settings/access";
import { removePushSubscription, savePushSubscription } from "@/server/push/subscriptions";

export async function registerDevice(subscription: PushSubscriptionJSON): Promise<void> {
  const actor = await requireOwner();
  if (!process.env.PUSH_VAPID_PUBLIC_KEY) throw new Error("Notificações ainda não configuradas.");
  await savePushSubscription(await getDb(), actor, subscription);
}

export async function removeDevice(subscription: PushSubscriptionJSON): Promise<void> {
  const actor = await requireOwner();
  await removePushSubscription(await getDb(), actor, subscription);
}
