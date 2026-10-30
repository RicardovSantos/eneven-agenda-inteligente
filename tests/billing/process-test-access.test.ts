import { eq } from "drizzle-orm";
import { expect, it } from "vitest";
import { billingInvoices, billingSubscriptions, billingWebhookEvents, tenants } from "@/db/schema";
import { processPaymentEvents } from "@/server/billing/process-events";
import { seedTenant } from "../helpers/agenda-fixtures";
import { createTestDb } from "../helpers/test-db";

it("reprocessa pagamento em teste quando a assinatura estiver confirmada", async () => {
  const db = await createTestDb();
  const tenant = await seedTenant(db);
  await db.update(tenants).set({ status: "past_due", pastDueAt: new Date("2020-01-02T00:00:00Z"), trialEndsAt: new Date("2020-01-01T00:00:00Z") }).where(eq(tenants.id, tenant.id));
  const [subscription] = await db.insert(billingSubscriptions).values({ tenantId: tenant.id, planId: tenant.planId, providerId: "sub", providerStatus: "authorized" }).returning();
  const [invoice] = await db.insert(billingInvoices).values({ tenantId: tenant.id, subscriptionId: subscription.id, providerId: "inv", providerStatus: "pending", amountCents: 3990, dueAt: new Date("2020-01-02T00:00:00Z"), invoiceUpdatedAt: new Date("2020-01-02T00:00:00Z") }).returning();
  await db.insert(billingWebhookEvents).values({ requestId: "event", resourceId: "123", topic: "payment" });
  const payment = { id: 123, external_reference: invoice.id, collector_id: 42, live_mode: false, currency_id: "BRL", transaction_amount: 39.9, status: "approved", date_last_updated: "2020-01-03T00:00:00Z", date_approved: "2020-01-03T00:00:00Z" };
  const config = { accessToken: "TEST-token", collectorId: "42", liveMode: false, fetcher: async () => Response.json(payment) };
  expect(await processPaymentEvents(db, config)).toEqual({ processed: 0, failed: 1 });
  let [stored] = await db.select().from(tenants).where(eq(tenants.id, tenant.id));
  expect(stored.status).toBe("past_due");
  await db.update(billingSubscriptions).set({ providerUpdatedAt: new Date("2020-01-03T00:00:00Z") }).where(eq(billingSubscriptions.id, subscription.id));
  await db.update(billingWebhookEvents).set({ nextAttemptAt: null }).where(eq(billingWebhookEvents.requestId, "event"));
  expect(await processPaymentEvents(db, config)).toEqual({ processed: 1, failed: 0 });
  [stored] = await db.select().from(tenants).where(eq(tenants.id, tenant.id));
  expect(stored.status).toBe("active");
  expect(stored.pastDueAt).toBeNull();
  expect(await processPaymentEvents(db, config)).toEqual({ processed: 0, failed: 0 });
});
