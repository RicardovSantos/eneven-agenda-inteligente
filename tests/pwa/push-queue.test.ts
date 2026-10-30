import { createECDH } from "node:crypto";
import { eq } from "drizzle-orm";
import { afterEach, expect, it, vi } from "vitest";
import { auditLog, memberships, pushDeliveries, pushEvents, pushSubscriptions, users } from "@/db/schema";
import { processTestPushQueue } from "@/server/push/process-test-queue";
import { removeExpiredTestSubscription, reviewTestDelivery } from "@/server/push/review-test-delivery";
import { POST } from "@/app/api/cron/notificacoes/route";
import { seedBooking, seedTenant } from "../helpers/agenda-fixtures";
import { createTestDb } from "../helpers/test-db";

afterEach(() => vi.unstubAllEnvs());

it("processa uma vez por dispositivo e retém falha incerta", async () => {
  const db = await createTestDb();
  const tenant = await seedTenant(db);
  const booking = await seedBooking(db, tenant.id);
  const [user] = await db.insert(users).values({ name: "Dona", email: "owner@example.com" }).returning();
  await db.insert(memberships).values({ userId: user.id, tenantId: tenant.id, role: "owner" });
  const now = new Date();
  const key = createECDH("prime256v1"); key.generateKeys();
  const base = { tenantId: tenant.id, userId: user.id, p256dh: key.getPublicKey().toString("base64url"), auth: Buffer.alloc(16, 1).toString("base64url") };
  await db.insert(pushSubscriptions).values([
    { ...base, endpointHash: "a", endpoint: "https://fcm.googleapis.com/a", createdAt: new Date(now.getTime() - 7 * 60_000) },
    { ...base, endpointHash: "b", endpoint: "https://fcm.googleapis.com/b", createdAt: new Date(now.getTime() - 7 * 60_000) },
    { ...base, endpointHash: "later", endpoint: "https://fcm.googleapis.com/c", createdAt: new Date(now.getTime() + 1000) },
  ]);
  await db.insert(pushEvents).values({ tenantId: tenant.id, bookingId: booking.id, eventType: "booking_created", eventKey: "created", createdAt: now });
  const sender = vi.fn(async (input: unknown) => {
    if ((input as { endpoint: string }).endpoint.endsWith("/b")) throw new Error("resultado incerto");
    return "sent" as const;
  });
  expect(await processTestPushQueue(db, sender, now)).toEqual({ expanded: 1, sent: 1, expired: 0, uncertain: 1 });
  expect((await db.select().from(pushDeliveries)).map((item) => item.status).sort()).toEqual(["sent", "uncertain"]);
  expect(await processTestPushQueue(db, sender, now)).toEqual({ expanded: 0, sent: 0, expired: 0, uncertain: 0 });
  expect(sender).toHaveBeenCalledTimes(2);
  const uncertain = (await db.select().from(pushDeliveries)).find((delivery) => delivery.status === "uncertain")!;
  await reviewTestDelivery(db, uncertain.id, user.id, "confirmed", now);
  await expect(reviewTestDelivery(db, uncertain.id, user.id, "retry", now)).rejects.toThrow("indisponível");
  expect(await db.select().from(auditLog)).toMatchObject([{ action: "push.test_delivery_reviewed", actorUserId: user.id }]);
  await db.insert(pushEvents).values({ tenantId: tenant.id, bookingId: booking.id, eventType: "booking_canceled", eventKey: "old", createdAt: new Date(now.getTime() - 6 * 60_000) });
  expect(await processTestPushQueue(db, sender, now)).toEqual({ expanded: 1, sent: 0, expired: 2, uncertain: 0 });
  expect(sender).toHaveBeenCalledTimes(2);
  const old = (await db.select().from(pushDeliveries)).find((item) => item.expirationReason === "event_old")!;
  await expect(removeExpiredTestSubscription(db, old.id, user.id)).rejects.toThrow("indisponível");
});

it("nega a rota de processamento em produção ou sem autorização", async () => {
  const request = (auth = "") => new Request("http://localhost/api/cron/notificacoes", { method: "POST", headers: { authorization: auth } });
  vi.stubEnv("NODE_ENV", "production");
  expect((await POST(request())).status).toBe(503);
  vi.stubEnv("NODE_ENV", "test"); vi.stubEnv("CRON_SECRET", "secret");
  expect((await POST(request("Bearer wrong"))).status).toBe(401);
  vi.stubEnv("PUSH_TEST_ONLY", "false");
  expect((await POST(request("Bearer secret"))).status).toBe(503);
});

it("remove apenas a inscrição rejeitada pelo provedor se ela não mudou", async () => {
  const db = await createTestDb();
  const tenant = await seedTenant(db);
  const booking = await seedBooking(db, tenant.id);
  const [user] = await db.insert(users).values({ name: "Operador", email: "admin@example.com", isSuperAdmin: true }).returning();
  await db.insert(memberships).values({ userId: user.id, tenantId: tenant.id, role: "owner" });
  const now = new Date();
  const [subscription] = await db.insert(pushSubscriptions).values({ tenantId: tenant.id, userId: user.id, endpointHash: "expired", endpoint: "https://fcm.googleapis.com/expired", p256dh: "key", auth: "auth", createdAt: new Date(now.getTime() - 1000) }).returning();
  await db.insert(pushEvents).values({ tenantId: tenant.id, bookingId: booking.id, eventType: "booking_created", eventKey: "created", createdAt: now });
  await processTestPushQueue(db, async () => "expired", now);
  const [delivery] = await db.select().from(pushDeliveries);
  expect(delivery.expirationReason).toBe("subscription_gone");
  await db.update(pushSubscriptions).set({ auth: "new-auth" }).where(eq(pushSubscriptions.id, subscription.id));
  await expect(removeExpiredTestSubscription(db, delivery.id, user.id)).rejects.toThrow("alterada");
  expect(await db.select().from(pushSubscriptions)).toHaveLength(1);
  await db.update(pushSubscriptions).set({ auth: "auth" }).where(eq(pushSubscriptions.id, subscription.id));
  await removeExpiredTestSubscription(db, delivery.id, user.id);
  expect(await db.select().from(pushSubscriptions)).toHaveLength(0);
  expect(await db.select().from(auditLog)).toMatchObject([{ action: "push.test_expired_subscription_removed" }]);
});
