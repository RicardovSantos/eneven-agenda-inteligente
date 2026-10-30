import { afterAll, beforeEach, expect, it } from "vitest";
import { billingInvoicePaymentLinks, billingInvoices, billingSubscriptions } from "@/db/schema";
import { reconcileAuthorizedInvoice } from "@/server/billing/reconcile-invoice";
import { withTenant } from "@/server/tenant-db";
import { seedTenant } from "../helpers/agenda-fixtures";
import { connectPg } from "./pg-db";

const pg = connectPg();
beforeEach(() => pg.truncate());
afterAll(() => pg.close());

it("serializa fatura repetida e mantém vínculo isolado", async () => {
  const a = await seedTenant(pg.db);
  const b = await seedTenant(pg.db);
  const [sub] = await pg.db.insert(billingSubscriptions).values({ tenantId: a.id, planId: a.planId, priceCents: 3990, providerId: "sub-pg", providerStatus: "authorized" }).returning();
  const subscription = { id: "sub-pg", external_reference: sub.id, collector_id: 42, auto_recurring: { frequency: 1, frequency_type: "months", transaction_amount: 39.9, currency_id: "BRL" } };
  const invoice = { id: 19, preapproval_id: "sub-pg", external_reference: sub.id, currency_id: "BRL", transaction_amount: 39.9, last_modified: "2030-01-03T00:00:00Z", debit_date: "2030-01-02T00:00:00Z", payment: { id: 123 } };
  const fetcher: typeof fetch = async (url) => Response.json(String(url).includes("authorized_payments") ? invoice : subscription);
  const config = { accessToken: "test", collectorId: "42", liveMode: false, fetcher };
  await Promise.all([reconcileAuthorizedInvoice(pg.db, "19", config), reconcileAuthorizedInvoice(pg.db, "19", config)]);
  expect(await withTenant(pg.db, a.id, (tx) => tx.select().from(billingInvoices))).toHaveLength(1);
  expect(await withTenant(pg.db, b.id, (tx) => tx.select().from(billingInvoices))).toHaveLength(0);
  expect(await withTenant(pg.db, a.id, (tx) => tx.select().from(billingInvoicePaymentLinks))).toHaveLength(1);
  expect(await withTenant(pg.db, b.id, (tx) => tx.select().from(billingInvoicePaymentLinks))).toHaveLength(0);
});
