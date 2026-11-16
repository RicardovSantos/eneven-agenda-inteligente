import { createECDH } from "node:crypto";
import { eq } from "drizzle-orm";
import { expect, it } from "vitest";
import { memberships, pushSubscriptions, users } from "@/db/schema";
import { listPushDevices, pushDeviceStatus, removePushDeviceById, removePushSubscription, savePushSubscription } from "@/server/push/subscriptions";
import { seedTenant } from "../helpers/agenda-fixtures";
import { createTestDb } from "../helpers/test-db";

it("isola dispositivos por usuário, impede apropriação e remove inscrição com o vínculo", async () => {
  const db = await createTestDb();
  const tenant = await seedTenant(db);
  const other = await seedTenant(db);
  const [user] = await db.insert(users).values({ name: "A", email: "a@example.com" }).returning();
  const [otherUser] = await db.insert(users).values({ name: "B", email: "b@example.com" }).returning();
  await db.insert(memberships).values([{ userId: user.id, tenantId: tenant.id, role: "owner" }, { userId: otherUser.id, tenantId: other.id, role: "owner" }]);
  const actor = { userId: user.id, tenantId: tenant.id, support: false };
  const outsider = { userId: otherUser.id, tenantId: other.id, support: false };
  const key = createECDH("prime256v1"); key.generateKeys();
  const subscription = { endpoint: "https://push.example/device/1", keys: { p256dh: key.getPublicKey().toString("base64url"), auth: Buffer.alloc(16, 1).toString("base64url") } };
  await savePushSubscription(db, actor, subscription);
  await savePushSubscription(db, actor, subscription);
  expect(await db.select().from(pushSubscriptions)).toHaveLength(1);
  const [device] = await listPushDevices(db, actor);
  expect(device).not.toHaveProperty("endpoint");
  expect(await listPushDevices(db, outsider)).toHaveLength(0);
  await expect(removePushDeviceById(db, outsider, device.id)).rejects.toThrow("indisponível");
  await expect(savePushSubscription(db, outsider, subscription)).rejects.toThrow("indisponível");
  await expect(savePushSubscription(db, { ...actor, support: true }, subscription)).rejects.toThrow("suporte");
  await expect(removePushSubscription(db, outsider, subscription)).rejects.toThrow("indisponível");
  expect(await db.select().from(pushSubscriptions)).toHaveLength(1);
  await db.delete(memberships).where(eq(memberships.userId, user.id));
  expect(await db.select().from(pushSubscriptions)).toHaveLength(0);
  await expect(savePushSubscription(db, actor, subscription)).rejects.toThrow("Acesso indisponível");
});

it("informa a situação do aparelho e a renovação limpa os aparelhos parados do mesmo usuário", async () => {
  const db = await createTestDb();
  const tenant = await seedTenant(db);
  const [user] = await db.insert(users).values({ name: "A", email: "renova@example.com" }).returning();
  await db.insert(memberships).values({ userId: user.id, tenantId: tenant.id, role: "owner" });
  const actor = { userId: user.id, tenantId: tenant.id, support: false };
  const key = createECDH("prime256v1"); key.generateKeys();
  const make = (n: number) => ({ endpoint: `https://push.example/device/${n}`, keys: { p256dh: key.getPublicKey().toString("base64url"), auth: Buffer.alloc(16, n).toString("base64url") } });

  expect(await pushDeviceStatus(db, actor, make(1))).toBe("unknown"); // nunca cadastrado (ou removido de propósito)
  await savePushSubscription(db, actor, make(1));
  expect(await pushDeviceStatus(db, actor, make(1))).toBe("ok");
  await db.update(pushSubscriptions).set({ staleAt: new Date() });
  expect(await pushDeviceStatus(db, actor, make(1))).toBe("stale");
  expect(await pushDeviceStatus(db, { ...actor, support: true }, make(1))).toBe("unknown");
  expect((await listPushDevices(db, actor))[0]?.staleAt).toBeInstanceOf(Date);

  // Renovar = cadastrar a inscrição nova: a antiga (parada) some e a nova entra limpa.
  await savePushSubscription(db, actor, make(2));
  const rows = await db.select().from(pushSubscriptions);
  expect(rows).toHaveLength(1);
  expect(rows[0]).toMatchObject({ endpoint: "https://push.example/device/2", staleAt: null });
  expect(await pushDeviceStatus(db, actor, make(2))).toBe("ok");

  // Outro aparelho saudável do mesmo usuário nunca é apagado pela renovação.
  await savePushSubscription(db, actor, make(3));
  expect(await db.select().from(pushSubscriptions)).toHaveLength(2);
});
