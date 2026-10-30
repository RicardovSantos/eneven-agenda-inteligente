"use server";

import { getDb } from "@/db/client";
import { requireSuperAdminSession } from "@/server/auth/guard";
import { removeExpiredTestSubscription, reviewTestDelivery } from "@/server/push/review-test-delivery";
import { revalidatePath } from "next/cache";

export async function reviewDelivery(form: FormData): Promise<void> {
  const session = await requireSuperAdminSession();
  const id = form.get("id");
  const decision = form.get("decision");
  if (typeof id !== "string" || (decision !== "confirmed" && decision !== "retry")) throw new Error("Dados inválidos.");
  await reviewTestDelivery(await getDb(), id, session.userId, decision);
  revalidatePath("/admin/notificacoes");
}

export async function removeExpiredDevice(form: FormData): Promise<void> {
  const session = await requireSuperAdminSession();
  const id = form.get("id");
  if (typeof id !== "string") throw new Error("Dados inválidos.");
  await removeExpiredTestSubscription(await getDb(), id, session.userId);
  revalidatePath("/admin/notificacoes");
}
