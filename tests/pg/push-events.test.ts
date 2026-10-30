import { afterAll, beforeEach, expect, it } from "vitest";
import { pushEvents } from "@/db/schema";
import { enqueueTestPushEvent } from "@/server/push/events";
import { withTenant } from "@/server/tenant-db";
import { seedBooking, seedTenant } from "../helpers/agenda-fixtures";
import { connectPg } from "./pg-db";

const pg = connectPg();
beforeEach(() => pg.truncate());
afterAll(() => pg.close());

it("deduplica eventos simultâneos e impede leitura direta pelo papel do painel", async () => {
  const tenant = await seedTenant(pg.db);
  const booking = await seedBooking(pg.db, tenant.id);
  const now = new Date("2030-01-01T00:00:00Z");
  await Promise.all([1, 2].map(() => withTenant(pg.db, tenant.id, (tx) => enqueueTestPushEvent(tx, tenant.id, booking.id, "booking_created", "created", now))));
  expect(await pg.db.select().from(pushEvents)).toHaveLength(1);
  await expect(withTenant(pg.db, tenant.id, (tx) => tx.select().from(pushEvents))).rejects.toThrow();
  const other = await seedTenant(pg.db);
  await expect(withTenant(pg.db, other.id, (tx) => enqueueTestPushEvent(tx, tenant.id, booking.id, "booking_created", "other", now))).rejects.toThrow();
});
