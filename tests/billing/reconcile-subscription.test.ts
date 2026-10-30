import { eq } from "drizzle-orm";
import { expect, it } from "vitest";
import { billingSubscriptions, billingWebhookEvents, tenants } from "@/db/schema";
import { processPaymentEvents } from "@/server/billing/process-events";
import { reconcileSubscription } from "@/server/billing/reconcile-subscription";
import { seedTenant } from "../helpers/agenda-fixtures";
import { createTestDb } from "../helpers/test-db";

it("valida e atualiza assinatura vinculada, ignorando notificações antigas", async () => {
  const db = await createTestDb();
  const tenant = await seedTenant(db);
  const [subscription] = await db.insert(billingSubscriptions).values({ tenantId: tenant.id, planId: tenant.planId, priceCents: 3990, providerId: "sub-1", providerStatus: "pending" }).returning();
  const remote = { id: "sub-1", external_reference: subscription.id, collector_id: 42, status: "authorized", last_modified: "2030-01-02T00:00:00Z", auto_recurring: { frequency: 1, frequency_type: "months", transaction_amount: 39.9, currency_id: "BRL" } };
  const config = { accessToken: "test", collectorId: "42", liveMode: false, fetcher: async () => Response.json(remote) };
  await expect(reconcileSubscription(db, "sub-1", { ...config, collectorId: "99" })).rejects.toThrow();
  await db.insert(billingWebhookEvents).values({ requestId: "request-sub", resourceId: "sub-1", topic: "subscription_preapproval" });
  expect(await processPaymentEvents(db, config)).toEqual({ processed: 1, failed: 0 });
  const [saved] = await db.select().from(billingSubscriptions).where(eq(billingSubscriptions.id, subscription.id));
  expect(saved.providerStatus).toBe("authorized");
  const previous = { ...remote, status: "pending", last_modified: "2030-01-01T00:00:00Z" };
  expect(await reconcileSubscription(db, "sub-1", { ...config, fetcher: async () => Response.json(previous) })).toBe("unchanged");
  await expect(reconcileSubscription(db, "sub-1", { ...config, fetcher: async () => Response.json({ ...remote, status: "paused" }) })).rejects.toThrow("ambígua");
  const [unchanged] = await db.select().from(tenants).where(eq(tenants.id, tenant.id));
  expect(unchanged.status).toBe(tenant.status);
});
