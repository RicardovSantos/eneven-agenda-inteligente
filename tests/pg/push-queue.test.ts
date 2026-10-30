import { afterAll, beforeEach, expect, it, vi } from "vitest";
import { eq } from "drizzle-orm";
import { memberships, pushDeliveries, pushEvents, pushSubscriptions, users } from "@/db/schema";
import { processTestPushQueue } from "@/server/push/process-test-queue";
import { removeExpiredTestSubscription, reviewTestDelivery } from "@/server/push/review-test-delivery";
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

it("não remove inscrição atualizada após resposta de expiração", async () => {
  const tenant = await seedTenant(pg.db);
  const booking = await seedBooking(pg.db, tenant.id);
  const [user] = await pg.db.insert(users).values({ name: "Operador", email: "admin@example.com", isSuperAdmin: true }).returning();
  await pg.db.insert(memberships).values({ tenantId: tenant.id, userId: user.id, role: "owner" });
  const now = new Date();
  const [subscription] = await pg.db.insert(pushSubscriptions).values({ tenantId: tenant.id, userId: user.id, endpointHash: "expired", endpoint: "https://fcm.googleapis.com/a", p256dh: "test", auth: "old", createdAt: new Date(now.getTime() - 1000) }).returning();
  await pg.db.insert(pushEvents).values({ tenantId: tenant.id, bookingId: booking.id, eventType: "booking_created", eventKey: "created", createdAt: now });
  await processTestPushQueue(pg.db, async () => "expired", now);
  const [delivery] = await pg.db.select().from(pushDeliveries);
  await pg.db.update(pushSubscriptions).set({ auth: "new" }).where(eq(pushSubscriptions.id, subscription.id));
  await expect(removeExpiredTestSubscription(pg.db, delivery.id, user.id)).rejects.toThrow("alterada");
  expect(await pg.db.select().from(pushSubscriptions)).toHaveLength(1);
});

it("aceita uma única revisão simultânea de entrega incerta", async () => {
  const tenant = await seedTenant(pg.db);
  const booking = await seedBooking(pg.db, tenant.id);
  const [user] = await pg.db.insert(users).values({ name: "Operador", email: "operator@example.com", isSuperAdmin: true }).returning();
  await pg.db.insert(memberships).values({ tenantId: tenant.id, userId: user.id, role: "owner" });
  const now = new Date();
  await pg.db.insert(pushSubscriptions).values({ tenantId: tenant.id, userId: user.id, endpointHash: "b", endpoint: "https://fcm.googleapis.com/b", p256dh: "test", auth: "test", createdAt: new Date(now.getTime() - 1000) });
  await pg.db.insert(pushEvents).values({ tenantId: tenant.id, bookingId: booking.id, eventType: "booking_created", eventKey: "created", createdAt: now });
  await processTestPushQueue(pg.db, async () => { throw new Error("incerto"); }, now);
  const [delivery] = await pg.db.select().from(pushDeliveries);
  const results = await Promise.allSettled([reviewTestDelivery(pg.db, delivery.id, user.id, "confirmed", now), reviewTestDelivery(pg.db, delivery.id, user.id, "confirmed", now)]);
  expect(results.filter((result) => result.status === "fulfilled")).toHaveLength(1);
});
