import { eq } from "drizzle-orm";
import { expect, it } from "vitest";
import { billingInvoicePaymentLinks, billingInvoices, billingSubscriptions, billingWebhookEvents, tenants } from "@/db/schema";
import { processPaymentEvents } from "@/server/billing/process-events";
import { reconcileAuthorizedInvoice } from "@/server/billing/reconcile-invoice";
import { reconcilePayment } from "@/server/billing/reconcile-payment";
import { seedTenant } from "../helpers/agenda-fixtures";
import { createTestDb } from "../helpers/test-db";

it("vincula fatura recorrente à assinatura e confere pagamento antes de marcá-la paga", async () => {
  const db = await createTestDb();
  const tenant = await seedTenant(db);
  const [subscription] = await db.insert(billingSubscriptions).values({ tenantId: tenant.id, planId: tenant.planId, priceCents: 3990, providerId: "sub-1", providerStatus: "authorized" }).returning();
  const preapproval = { id: "sub-1", external_reference: subscription.id, collector_id: 42, status: "authorized", auto_recurring: { frequency: 1, frequency_type: "months", transaction_amount: 39.9, currency_id: "BRL" } };
  const invoice = { id: 19, preapproval_id: "sub-1", external_reference: subscription.id, currency_id: "BRL", transaction_amount: "39.90", last_modified: "2030-01-03T00:00:00Z", debit_date: "2030-01-02T00:00:00Z", payment: { id: 123, status: "approved" } };
  const payment = { id: 123, external_reference: subscription.id, collector_id: 42, live_mode: false, currency_id: "BRL", transaction_amount: 39.9, status: "approved", date_last_updated: "2030-01-04T00:00:00Z", date_approved: "2030-01-04T00:00:00Z" };
  const fetcher: typeof fetch = async (url) => {
    const path = String(url);
    return Response.json(path.includes("authorized_payments") ? invoice : path.includes("preapproval") ? preapproval : payment);
  };
  const config = { accessToken: "test", collectorId: "42", liveMode: false, fetcher };
  const badFetcher: typeof fetch = async (url, init) => String(url).includes("preapproval") ? Response.json({ ...preapproval, collector_id: 99 }) : fetcher(url, init);
  await expect(reconcileAuthorizedInvoice(db, "19", { ...config, fetcher: badFetcher })).rejects.toThrow();
  expect(await db.select().from(billingInvoices)).toHaveLength(0);
  await expect(reconcilePayment(db, "123", config)).rejects.toThrow("não corresponde");
  await db.insert(billingWebhookEvents).values({ requestId: "invoice-event", resourceId: "19", topic: "subscription_authorized_payment" });
  expect(await processPaymentEvents(db, config)).toEqual({ processed: 1, failed: 0 });
  const [saved] = await db.select().from(billingInvoices);
  expect(saved).toMatchObject({ tenantId: tenant.id, subscriptionId: subscription.id, providerId: "19", providerStatus: "approved", paymentId: "123" });
  expect(await db.select().from(billingInvoicePaymentLinks)).toHaveLength(1);
  expect(await reconcileAuthorizedInvoice(db, "19", config)).toEqual({ paymentId: "123" });
  const [unchanged] = await db.select().from(tenants).where(eq(tenants.id, tenant.id));
  expect(unchanged.status).toBe(tenant.status);
});
