import { afterAll, beforeEach, expect, it, vi } from "vitest";
import { memberships, pushDeliveries, pushEvents, pushSubscriptions, users } from "@/db/schema";
import { processTestPushQueue } from "@/server/push/process-test-queue";
import { withTenant } from "@/server/tenant-db";
import { seedBooking, seedTenant } from "../helpers/agenda-fixtures";
import { connectPg } from "./pg-db";

const pg = connectPg();
beforeEach(() => pg.truncate());
afterAll(() => pg.close());

it("dois processadores não enviam o mesmo evento ao mesmo dispositivo", async () => {
  const tenant = await seedTenant(pg.db);
  const booking = await seedBooking(pg.db, tenant.id);
  const [user] = await pg.db.insert(users).values({ name: "Dona", email: "owner@example.com" }).returning();
  await pg.db.insert(memberships).values({ tenantId: tenant.id, userId: user.id, role: "owner" });
  const now = new Date();
  await pg.db.insert(pushSubscriptions).values({ tenantId: tenant.id, userId: user.id, endpointHash: "a", endpoint: "https://fcm.googleapis.com/a", p256dh: "test", auth: "test", createdAt: new Date(now.getTime() - 1000) });
  await pg.db.insert(pushEvents).values({ tenantId: tenant.id, bookingId: booking.id, eventType: "booking_created", eventKey: "created", createdAt: now });
  const sender = vi.fn(async () => "sent" as const);
  await Promise.all([processTestPushQueue(pg.db, sender, now), processTestPushQueue(pg.db, sender, now)]);
  expect(sender).toHaveBeenCalledOnce();
  expect(await pg.db.select().from(pushDeliveries)).toMatchObject([{ status: "sent" }]);
  await expect(withTenant(pg.db, tenant.id, (tx) => tx.select().from(pushDeliveries))).rejects.toThrow();
});
