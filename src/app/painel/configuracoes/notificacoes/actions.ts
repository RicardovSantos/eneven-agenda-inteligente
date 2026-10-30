"use server";

import { getDb } from "@/db/client";
import { revalidatePath } from "next/cache";
import { requireOwner } from "@/server/settings/access";
import { removePushDeviceById, removePushSubscription, savePushSubscription } from "@/server/push/subscriptions";

export async function registerDevice(subscription: PushSubscriptionJSON): Promise<void> {
  const actor = await requireOwner();
  if (!process.env.PUSH_VAPID_PUBLIC_KEY) throw new Error("Notificações ainda não configuradas.");
  await savePushSubscription(await getDb(), actor, subscription);
  revalidatePath("/painel/configuracoes/notificacoes");
}

export async function removeDevice(subscription: PushSubscriptionJSON): Promise<void> {
  const actor = await requireOwner();
  await removePushSubscription(await getDb(), actor, subscription);
  revalidatePath("/painel/configuracoes/notificacoes");
}

export async function removeSavedDevice(form: FormData): Promise<void> {
  const actor = await requireOwner();
  const id = form.get("deviceId");
  if (typeof id !== "string") throw new Error("Dispositivo inválido.");
  await removePushDeviceById(await getDb(), actor, id);
  revalidatePath("/painel/configuracoes/notificacoes");
}
