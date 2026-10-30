"use server";

import { revalidatePath } from "next/cache";
import { getDb } from "@/db/client";
import { requireSuperAdminSession } from "@/server/auth/guard";
import { abandonTestSubscription, recoverTestSubscription } from "@/server/billing/recover-subscription";
import { reviewTestNotice } from "@/server/billing/review-test-notice";

export async function recoverSubscriptionAction(_state: string, form: FormData): Promise<string> {
  const actor = await requireSuperAdminSession();
  if (process.env.NODE_ENV === "production") return "Indisponível em produção.";
  const subscriptionId = form.get("subscriptionId");
  const providerId = form.get("providerId");
  const accessToken = process.env.MERCADO_PAGO_ACCESS_TOKEN;
  const collectorId = process.env.MERCADO_PAGO_COLLECTOR_ID;
  if (typeof subscriptionId !== "string" || typeof providerId !== "string" || !accessToken || !collectorId) return "Informe o ID e configure as credenciais de teste.";
  try {
    await recoverTestSubscription(await getDb(), { subscriptionId, providerId, actorUserId: actor.userId }, { accessToken, collectorId });
  } catch {
    return "Não foi possível confirmar a assinatura. Confira o ID e os dados no Mercado Pago.";
  }
  revalidatePath("/admin/cobranca");
  return "Assinatura recuperada.";
}

export async function reviewNoticeAction(form: FormData): Promise<void> {
  const actor = await requireSuperAdminSession();
  const id = form.get("noticeId");
  const decision = form.get("decision");
  if (typeof id !== "string" || (decision !== "confirmed" && decision !== "retry")) throw new Error("Dados inválidos.");
  await reviewTestNotice(await getDb(), id, actor.userId, decision);
  revalidatePath("/admin/cobranca");
}

export async function abandonSubscriptionAction(form: FormData): Promise<void> {
  const actor = await requireSuperAdminSession();
  if (process.env.NODE_ENV === "production") throw new Error("Indisponível em produção.");
  const id = form.get("subscriptionId");
  if (typeof id !== "string") throw new Error("Dados inválidos.");
  await abandonTestSubscription(await getDb(), id, actor.userId);
  revalidatePath("/admin/cobranca");
}
