import { afterAll, beforeEach, expect, it } from "vitest";
import { billingInvoicePaymentLinks, billingInvoices, billingSubscriptions } from "@/db/schema";
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

it("preserva o pagamento aprovado em tentativas simultâneas diferentes", async () => {
  const tenant = await seedTenant(pg.db);
  const [subscription] = await pg.db.insert(billingSubscriptions).values({ tenantId: tenant.id, planId: tenant.planId }).returning();
  const [invoice] = await pg.db.insert(billingInvoices).values({ tenantId: tenant.id, subscriptionId: subscription.id, providerId: tenant.id, providerStatus: "pending", amountCents: 3990 }).returning();
  const base = { external_reference: invoice.id, collector_id: 42, live_mode: false, currency_id: "BRL", transaction_amount: 39.9 };
  const responses: Record<string, object> = {
    "123": { ...base, id: 123, status: "approved", date_last_updated: "2030-01-02T00:00:00Z", date_approved: "2030-01-02T00:00:00Z" },
    "124": { ...base, id: 124, status: "rejected", date_last_updated: "2030-01-03T00:00:00Z" },
  };
  const fetcher: typeof fetch = async (url) => new Response(JSON.stringify(responses[String(url).split("/").pop()!]));
  const config = { accessToken: "test", collectorId: "42", liveMode: false, fetcher };
  await Promise.all([reconcilePayment(pg.db, "123", config), reconcilePayment(pg.db, "124", config)]);
  const [stored] = await pg.db.select().from(billingInvoices);
  expect(stored.providerStatus).toBe("approved");
  expect(stored.paymentId).toBe("123");
});

// Com o driver de produção (postgres-js): a busca da fatura sem pagamento ligado usa datas e travamento de linha.
it("liga o pagamento à fatura sem ligação, mesmo valor e horário, no PostgreSQL real", async () => {
  const tenant = await seedTenant(pg.db);
  const [subscription] = await pg.db.insert(billingSubscriptions).values({ tenantId: tenant.id, planId: tenant.planId }).returning();
  const [invoice] = await pg.db.insert(billingInvoices).values({ tenantId: tenant.id, subscriptionId: subscription.id, providerId: "inv-adopt", providerStatus: "pending", amountCents: 3990, dueAt: new Date("2030-01-02T00:00:00Z") }).returning();
  const payment = { id: 777, external_reference: subscription.id, collector_id: 42, live_mode: false, currency_id: "BRL", transaction_amount: 39.9, status: "rejected", date_created: "2030-01-02T00:00:30Z", date_last_updated: "2030-01-02T00:00:31Z" };
  const config = { accessToken: "test", collectorId: "42", liveMode: false, fetcher: async () => new Response(JSON.stringify(payment)) };
  expect(await reconcilePayment(pg.db, "777", config)).toBe("updated");
  const [stored] = await pg.db.select().from(billingInvoices);
  expect(stored).toMatchObject({ id: invoice.id, providerStatus: "rejected", paymentId: "777" });
  expect(await pg.db.select().from(billingInvoicePaymentLinks)).toHaveLength(1);
  // Dois avisos iguais ao mesmo tempo: só um atualiza.
  expect((await Promise.all([reconcilePayment(pg.db, "777", config), reconcilePayment(pg.db, "777", config)])).sort()).toEqual(["unchanged", "unchanged"]);
});
