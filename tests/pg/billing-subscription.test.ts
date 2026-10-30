import { afterAll, beforeEach, expect, it, vi } from "vitest";
import { createTestSubscription } from "@/server/billing/create-subscription";
import { abandonTestSubscription, recoverTestSubscription } from "@/server/billing/recover-subscription";
import { billingSubscriptions } from "@/db/schema";
import { seedTenant } from "../helpers/agenda-fixtures";
import { seedSuperAdmin } from "../helpers/platform-fixtures";
import { connectPg } from "./pg-db";

const pg = connectPg();
beforeEach(() => pg.truncate());
afterAll(() => pg.close());

it("reserva somente uma assinatura em chamadas simultâneas", async () => {
  const tenant = await seedTenant(pg.db);
  const fetcher = vi.fn<typeof fetch>().mockImplementation(async (_url, init) => {
    const body = JSON.parse(String(init?.body));
    return Response.json({ id: "sub-test", external_reference: body.external_reference, collector_id: 42, status: "pending", init_point: "https://www.mercadopago.com.br/subscriptions/checkout?id=sub-test", auto_recurring: body.auto_recurring });
  });
  const input = { tenantId: tenant.id, planId: tenant.planId, payerEmail: "owner@example.com", backUrl: "https://agenda.eneven.com.br/painel" };
  const config = { accessToken: "TEST-example", collectorId: "42", fetcher };
  const results = await Promise.allSettled([createTestSubscription(pg.db, input, config), createTestSubscription(pg.db, input, config)]);
  expect(results.filter((r) => r.status === "fulfilled")).toHaveLength(1);
  expect(results.filter((r) => r.status === "rejected")).toHaveLength(1);
  expect(fetcher).toHaveBeenCalledTimes(1);
});

it("permite somente uma recuperação de assinatura concorrente", async () => {
  const tenant = await seedTenant(pg.db);
  const actor = await seedSuperAdmin(pg.db);
  const [subscription] = await pg.db.insert(billingSubscriptions).values({ tenantId: tenant.id, planId: tenant.planId, priceCents: 3990, providerStatus: "uncertain" }).returning();
  const remote = { id: "recovered-sub", external_reference: subscription.id, collector_id: 42, status: "pending", init_point: "https://www.mercadopago.com.br/checkout", auto_recurring: { frequency: 1, frequency_type: "months", transaction_amount: 39.9, currency_id: "BRL" } };
  const config = { accessToken: "TEST-example", collectorId: "42", fetcher: async () => Response.json(remote) };
  const input = { subscriptionId: subscription.id, providerId: "recovered-sub", actorUserId: actor.id };
  const results = await Promise.allSettled([recoverTestSubscription(pg.db, input, config), recoverTestSubscription(pg.db, input, config)]);
  expect(results.filter((r) => r.status === "fulfilled")).toHaveLength(1);
  expect(results.filter((r) => r.status === "rejected")).toHaveLength(1);
});

it("não permite recuperar e liberar a mesma tentativa simultaneamente", async () => {
  const tenant = await seedTenant(pg.db);
  const actor = await seedSuperAdmin(pg.db);
  const [subscription] = await pg.db.insert(billingSubscriptions).values({ tenantId: tenant.id, planId: tenant.planId, priceCents: 3990, providerStatus: "uncertain" }).returning();
  const remote = { id: "race-sub", external_reference: subscription.id, collector_id: 42, status: "pending", init_point: "https://www.mercadopago.com.br/checkout", auto_recurring: { frequency: 1, frequency_type: "months", transaction_amount: 39.9, currency_id: "BRL" } };
  const config = { accessToken: "TEST-example", collectorId: "42", fetcher: async () => Response.json(remote) };
  const results = await Promise.allSettled([
    recoverTestSubscription(pg.db, { subscriptionId: subscription.id, providerId: "race-sub", actorUserId: actor.id }, config),
    abandonTestSubscription(pg.db, subscription.id, actor.id),
  ]);
  expect(results.filter((r) => r.status === "fulfilled")).toHaveLength(1);
  expect(results.filter((r) => r.status === "rejected")).toHaveLength(1);
});
