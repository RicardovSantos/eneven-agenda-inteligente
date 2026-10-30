"use server";

import { and, eq, isNotNull } from "drizzle-orm";
import { redirect } from "next/navigation";
import { getDb } from "@/db/client";
import { tenants, users } from "@/db/schema";
import { createTestSubscription } from "@/server/billing/create-subscription";
import { testBillingConfig } from "@/server/billing/test-config";
import { requireOwner } from "@/server/settings/access";

/** Somente contratação do plano atual no sandbox; troca de plano ainda não é suportada. */
export async function startTestCheckout(form: FormData): Promise<void> {
  const actor = await requireOwner();
  if (actor.support) throw new Error("Indisponível no modo suporte.");
  const config = testBillingConfig();
  if (!config) throw new Error("Cobrança de teste não configurada.");
  const planId = form.get("planId");
  if (typeof planId !== "string") throw new Error("Plano inválido.");
  const db = await getDb();
  const [tenant] = await db.select({ planId: tenants.planId, status: tenants.status }).from(tenants).where(eq(tenants.id, actor.tenantId)).limit(1);
  const [payer] = await db.select({ email: users.email }).from(users).where(and(eq(users.id, actor.userId), isNotNull(users.emailVerifiedAt))).limit(1);
  if (!tenant || !payer || !["trial", "active", "past_due"].includes(tenant.status) || tenant.planId !== planId) throw new Error("Contratação de teste indisponível.");
  const { checkoutUrl } = await createTestSubscription(db, { tenantId: actor.tenantId, planId: tenant.planId, payerEmail: payer.email, backUrl: config.backUrl, ownerUserId: actor.userId }, config);
  redirect(checkoutUrl);
}
