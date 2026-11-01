"use server";

import { and, eq, isNotNull } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { getDb } from "@/db/client";
import { tenants, users } from "@/db/schema";
import { cancelSubscription } from "@/server/billing/cancel-subscription";
import { createSubscription } from "@/server/billing/create-subscription";
import { billingConfig } from "@/server/billing/mode";
import { requireOwner } from "@/server/settings/access";

/** Contratação do plano atual: cobrança real em produção e sandbox fora dela. A troca de plano ainda não é suportada. */
export async function startCheckout(form: FormData): Promise<void> {
  const actor = await requireOwner();
  if (actor.support) throw new Error("Indisponível no modo suporte.");
  const config = billingConfig();
  if (!config) throw new Error("Cobrança não configurada.");
  const planId = form.get("planId");
  if (typeof planId !== "string") throw new Error("Plano inválido.");
  const db = await getDb();
  const [tenant] = await db.select({ planId: tenants.planId, status: tenants.status }).from(tenants).where(eq(tenants.id, actor.tenantId)).limit(1);
  const [payer] = await db.select({ email: users.email }).from(users).where(and(eq(users.id, actor.userId), isNotNull(users.emailVerifiedAt))).limit(1);
  if (!tenant || !payer || !["trial", "active", "past_due"].includes(tenant.status) || tenant.planId !== planId) throw new Error("Contratação indisponível.");
  const { checkoutUrl } = await createSubscription(db, { tenantId: actor.tenantId, planId: tenant.planId, payerEmail: payer.email, backUrl: config.backUrl, ownerUserId: actor.userId }, config);
  redirect(checkoutUrl);
}

/** Cancela a assinatura: o acesso continua até o fim do período já pago. */
export async function cancelSubscriptionAction(): Promise<void> {
  const actor = await requireOwner();
  if (actor.support) throw new Error("Indisponível no modo suporte.");
  const config = billingConfig();
  if (!config) throw new Error("Cobrança não configurada.");
  await cancelSubscription(await getDb(), { tenantId: actor.tenantId, ownerUserId: actor.userId }, config);
  revalidatePath("/painel/configuracoes/assinatura");
}
