import { afterAll, beforeEach, expect, it } from "vitest";
import { billingInvoices, billingSubscriptions } from "@/db/schema";
import { reconcilePayment } from "@/server/billing/reconcile-payment";
import { seedTenant } from "../helpers/agenda-fixtures";
import { connectPg } from "./pg-db";

const pg = connectPg();
beforeEach(() => pg.truncate());
afterAll(() => pg.close());

it("serializa a conciliação do mesmo pagamento no PostgreSQL", async () => {
  const tenant = await seedTenant(pg.db);
  const [subscription] = await pg.db.insert(billingSubscriptions).values({ tenantId: tenant.id, planId: tenant.planId }).returning();
  const [invoice] = await pg.db.insert(billingInvoices).values({ tenantId: tenant.id, subscriptionId: subscription.id, providerId: tenant.id, providerStatus: "pending", amountCents: 3990 }).returning();
  const payment = { id: 123, external_reference: invoice.id, collector_id: 42, live_mode: false, currency_id: "BRL", transaction_amount: 39.9, status: "approved", date_last_updated: "2030-01-02T00:00:00Z", date_approved: "2030-01-02T00:00:00Z" };
  const config = { accessToken: "test", collectorId: "42", liveMode: false, fetcher: async () => new Response(JSON.stringify(payment)) };
  const result = await Promise.all([reconcilePayment(pg.db, "123", config), reconcilePayment(pg.db, "123", config)]);
  expect(result.sort()).toEqual(["unchanged", "updated"]);
});
