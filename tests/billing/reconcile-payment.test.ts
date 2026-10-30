import { eq } from "drizzle-orm";
import { expect, it } from "vitest";
import { billingInvoices, billingPaymentAttempts, billingSubscriptions, billingWebhookEvents, tenants } from "@/db/schema";
import { reconcilePayment } from "@/server/billing/reconcile-payment";
import { processPaymentEvents } from "@/server/billing/process-events";
import { seedTenant } from "../helpers/agenda-fixtures";
import { createTestDb } from "../helpers/test-db";

it("concilia somente pagamento correspondente e não regride eventos antigos", async () => {
  const db = await createTestDb();
  const tenant = await seedTenant(db);
  const [subscription] = await db.insert(billingSubscriptions).values({ tenantId: tenant.id, planId: tenant.planId }).returning();
  const [invoice] = await db.insert(billingInvoices).values({ tenantId: tenant.id, subscriptionId: subscription.id, providerId: "invoice-1", providerStatus: "pending", amountCents: 3990 }).returning();
  const payment = { id: 123, external_reference: invoice.id, collector_id: 42, live_mode: false, currency_id: "BRL", transaction_amount: 39.9, status: "approved", date_last_updated: "2030-01-02T00:00:00Z", date_approved: "2030-01-02T00:00:00Z" };
  const config = { accessToken: "test", collectorId: "42", liveMode: false, fetcher: async () => new Response(JSON.stringify(payment)) };
  await expect(reconcilePayment(db, "123", { ...config, collectorId: "999" })).rejects.toThrow("não corresponde");
  expect(await reconcilePayment(db, "123", config)).toBe("updated");
  expect(await reconcilePayment(db, "123", config)).toBe("unchanged");
  const old = { ...payment, status: "pending", date_last_updated: "2030-01-01T00:00:00Z" };
  expect(await reconcilePayment(db, "123", { ...config, fetcher: async () => new Response(JSON.stringify(old)) })).toBe("unchanged");
  const ambiguous = { ...payment, status: "refunded", date_approved: null };
  await expect(reconcilePayment(db, "123", { ...config, fetcher: async () => new Response(JSON.stringify(ambiguous)) })).rejects.toThrow("ambígua");
  const [stored] = await db.select().from(billingInvoices).where(eq(billingInvoices.id, invoice.id));
  expect(stored.providerStatus).toBe("approved");
  expect(stored.paymentId).toBe("123");
  const [unchanged] = await db.select().from(tenants).where(eq(tenants.id, tenant.id));
  expect(unchanged.status).toBe(tenant.status);
});

it("processa eventos repetidos e preserva pagamento aprovado ao registrar tentativa recusada", async () => {
  const db = await createTestDb();
  const tenant = await seedTenant(db);
  const [subscription] = await db.insert(billingSubscriptions).values({ tenantId: tenant.id, planId: tenant.planId }).returning();
  const [invoice] = await db.insert(billingInvoices).values({ tenantId: tenant.id, subscriptionId: subscription.id, providerId: "invoice-multiple", providerStatus: "pending", amountCents: 3990 }).returning();
  const base = { external_reference: invoice.id, collector_id: 42, live_mode: false, currency_id: "BRL", transaction_amount: 39.9 };
  const records: Record<string, object> = {
    "100": { ...base, id: 100, status: "approved", date_last_updated: "2030-01-02T00:00:00Z", date_approved: "2030-01-02T00:00:00Z" },
    "101": { ...base, id: 101, status: "rejected", date_last_updated: "2030-01-03T00:00:00Z" },
  };
  const fetcher: typeof fetch = async (url) => new Response(JSON.stringify(records[String(url).split("/").pop()!]));
  const config = { accessToken: "test", collectorId: "42", liveMode: false, fetcher };
  await db.insert(billingWebhookEvents).values([
    { requestId: "first", resourceId: "100", topic: "payment" },
    { requestId: "duplicate", resourceId: "100", topic: "payment" },
    { requestId: "second", resourceId: "101", topic: "payment" },
    { requestId: "unknown", resourceId: "999", topic: "payment" },
    { requestId: "subscription", resourceId: "sub", topic: "subscription_preapproval" },
  ]);
  expect(await processPaymentEvents(db, config)).toEqual({ processed: 3, failed: 2 });
  const [saved] = await db.select().from(billingInvoices).where(eq(billingInvoices.id, invoice.id));
  expect(saved.providerStatus).toBe("approved");
  expect(saved.paymentId).toBe("100");
  expect(await db.select().from(billingPaymentAttempts)).toHaveLength(2);
  expect(await processPaymentEvents(db, config)).toEqual({ processed: 0, failed: 0 });
});
