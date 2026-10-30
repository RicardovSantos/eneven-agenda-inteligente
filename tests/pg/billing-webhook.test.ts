import { afterAll, beforeEach, expect, it } from "vitest";
import { randomUUID } from "node:crypto";
import { billingWebhookEvents } from "@/db/schema";
import { withTenant } from "@/server/tenant-db";
import { seedTenant } from "../helpers/agenda-fixtures";
import { failure } from "../helpers/db-assertions";
import { connectPg } from "./pg-db";

const pg = connectPg();
beforeEach(() => pg.truncate());
afterAll(() => pg.close());

it("restringe acesso à fila global e deduplica reivindicações concorrentes", async () => {
  const tenant = await seedTenant(pg.db);
  const requestId = randomUUID();
  const records = await Promise.all(Array.from({ length: 3 }, () => pg.db.insert(billingWebhookEvents)
    .values({ requestId, resourceId: "payment-pg", topic: "payment" })
    .onConflictDoNothing().returning({ requestId: billingWebhookEvents.requestId })));
  expect(records.flat()).toHaveLength(1);
  expect(await failure(withTenant(pg.db, tenant.id, (tx) => tx.select().from(billingWebhookEvents)))).not.toBeNull();
});
