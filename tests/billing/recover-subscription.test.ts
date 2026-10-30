import { eq } from "drizzle-orm";
import { expect, it } from "vitest";
import { auditLog, billingSubscriptions } from "@/db/schema";
import { recoverTestSubscription } from "@/server/billing/recover-subscription";
import { seedTenant } from "../helpers/agenda-fixtures";
import { seedSuperAdmin } from "../helpers/platform-fixtures";
import { createTestDb } from "../helpers/test-db";

it("recupera apenas assinatura correspondente e registra auditoria", async () => {
  const db = await createTestDb();
  const tenant = await seedTenant(db);
  const actor = await seedSuperAdmin(db);
  const [attempt] = await db.insert(billingSubscriptions).values({ tenantId: tenant.id, planId: tenant.planId, providerStatus: "uncertain", priceCents: 3990 }).returning();
  const remote = { id: "sub-test", external_reference: attempt.id, collector_id: 42, status: "pending", init_point: "https://www.mercadopago.com.br/subscriptions/checkout?id=sub-test", auto_recurring: { frequency: 1, frequency_type: "months", transaction_amount: 39.9, currency_id: "BRL" } };
  const fetcher: typeof fetch = async () => Response.json(remote);
  const input = { subscriptionId: attempt.id, providerId: "sub-test", actorUserId: actor.id };
  const config = { accessToken: "TEST-example", collectorId: "42", fetcher };
  await expect(recoverTestSubscription(db, input, { ...config, collectorId: "43" })).rejects.toThrow();
  await recoverTestSubscription(db, input, config);
  const [saved] = await db.select().from(billingSubscriptions).where(eq(billingSubscriptions.id, attempt.id));
  expect(saved).toMatchObject({ providerStatus: "pending", providerId: "sub-test" });
  expect(await db.select().from(auditLog).where(eq(auditLog.action, "billing.subscription_recovered"))).toHaveLength(1);
  await expect(recoverTestSubscription(db, input, config)).rejects.toThrow("indisponível");
});
