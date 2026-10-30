import { eq } from "drizzle-orm";
import { expect, it } from "vitest";
import { billingInvoices, billingSubscriptions, tenants } from "@/db/schema";
import { reconcilePayment } from "@/server/billing/reconcile-payment";
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
  const [stored] = await db.select().from(billingInvoices).where(eq(billingInvoices.id, invoice.id));
  expect(stored.providerStatus).toBe("approved");
  expect(stored.paymentId).toBe("123");
  const [unchanged] = await db.select().from(tenants).where(eq(tenants.id, tenant.id));
  expect(unchanged.status).toBe(tenant.status);
});
