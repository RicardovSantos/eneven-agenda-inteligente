"use server";

import { revalidatePath } from "next/cache";
import { getDb } from "@/db/client";
import { requireSuperAdminSession } from "@/server/auth/guard";
import { billingConfig, liveBillingEnabled } from "@/server/billing/mode";
import { abandonTestSubscription, recoverSubscription } from "@/server/billing/recover-subscription";
import { reviewTestNotice } from "@/server/billing/review-test-notice";

export async function recoverSubscriptionAction(_state: string, form: FormData): Promise<string> {
  const actor = await requireSuperAdminSession();
  if (process.env.NODE_ENV === "production" && !liveBillingEnabled()) return "Indisponível em produção.";
  const subscriptionId = form.get("subscriptionId");
  const providerId = form.get("providerId");
  const config = billingConfig();
  if (typeof subscriptionId !== "string" || typeof providerId !== "string" || !config) return "Informe o ID e configure as credenciais.";
  const { accessToken, collectorId, live } = config;
  try {
    await recoverSubscription(await getDb(), { subscriptionId, providerId, actorUserId: actor.userId }, { accessToken, collectorId, live });
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
  if (process.env.NODE_ENV === "production" && !liveBillingEnabled()) throw new Error("Indisponível em produção.");
  const id = form.get("subscriptionId");
  if (typeof id !== "string") throw new Error("Dados inválidos.");
  await abandonTestSubscription(await getDb(), id, actor.userId);
  revalidatePath("/admin/cobranca");
}
