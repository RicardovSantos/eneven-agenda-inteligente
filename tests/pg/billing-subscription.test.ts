import { afterAll, beforeEach, expect, it, vi } from "vitest";
import { createTestSubscription } from "@/server/billing/create-subscription";
import { seedTenant } from "../helpers/agenda-fixtures";
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
