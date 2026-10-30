import { createECDH } from "node:crypto";
import { afterAll, beforeEach, expect, it } from "vitest";
import { memberships, pushSubscriptions, users } from "@/db/schema";
import { savePushSubscription } from "@/server/push/subscriptions";
import { withTenant } from "@/server/tenant-db";
import { seedTenant } from "../helpers/agenda-fixtures";
import { connectPg } from "./pg-db";

const pg = connectPg();
beforeEach(() => pg.truncate());
afterAll(() => pg.close());

it("restringe acesso direto às inscrições e impede concorrência entre contas", async () => {
  const a = await seedTenant(pg.db);
  const b = await seedTenant(pg.db);
  const [userA, userB] = await pg.db.insert(users).values([{ name: "A", email: "a@example.com" }, { name: "B", email: "b@example.com" }]).returning();
  await pg.db.insert(memberships).values([{ tenantId: a.id, userId: userA.id, role: "owner" }, { tenantId: b.id, userId: userB.id, role: "owner" }]);
  const key = createECDH("prime256v1"); key.generateKeys();
  const sub = { endpoint: "https://push.example/device/1", keys: { p256dh: key.getPublicKey().toString("base64url"), auth: Buffer.alloc(16, 1).toString("base64url") } };
  const results = await Promise.allSettled([savePushSubscription(pg.db, { tenantId: a.id, userId: userA.id, support: false }, sub), savePushSubscription(pg.db, { tenantId: b.id, userId: userB.id, support: false }, sub)]);
  expect(results.filter((result) => result.status === "fulfilled")).toHaveLength(1);
  expect(await pg.db.select().from(pushSubscriptions)).toHaveLength(1);
  await expect(withTenant(pg.db, a.id, (tx) => tx.select().from(pushSubscriptions))).rejects.toThrow();
});
