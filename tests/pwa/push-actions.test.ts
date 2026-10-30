import { createECDH } from "node:crypto";
import { afterEach, expect, it, vi } from "vitest";
import { memberships, pushSubscriptions, users } from "@/db/schema";
import { seedTenant } from "../helpers/agenda-fixtures";
import { createTestDb } from "../helpers/test-db";

const state = vi.hoisted(() => ({ db: undefined as unknown, session: undefined as unknown }));
vi.mock("@/db/client", () => ({ getDb: async () => state.db }));
vi.mock("@/server/auth/guard", () => ({ requireTenantSession: async () => state.session }));
import { registerDevice, removeDevice } from "@/app/painel/configuracoes/notificacoes/actions";

afterEach(() => vi.unstubAllEnvs());

it("aceita somente o dono da sessão e impede ações durante suporte", async () => {
  const db = await createTestDb(); state.db = db;
  const tenant = await seedTenant(db);
  const [user] = await db.insert(users).values({ name: "Dona", email: "owner@example.com" }).returning();
  await db.insert(memberships).values({ userId: user.id, tenantId: tenant.id, role: "owner" });
  const key = createECDH("prime256v1"); key.generateKeys();
  const subscription = { endpoint: "https://push.example/device/1", keys: { p256dh: key.getPublicKey().toString("base64url"), auth: Buffer.alloc(16, 1).toString("base64url") } };
  vi.stubEnv("PUSH_VAPID_PUBLIC_KEY", "test");
  state.session = { userId: user.id, tenantId: tenant.id, role: "staff", support: false };
  await expect(registerDevice(subscription)).rejects.toThrow();
  state.session = { userId: user.id, tenantId: tenant.id, role: "owner", support: true };
  await expect(registerDevice(subscription)).rejects.toThrow("suporte");
  state.session = { userId: user.id, tenantId: tenant.id, role: "owner", support: false };
  await registerDevice(subscription);
  expect(await db.select().from(pushSubscriptions)).toHaveLength(1);
  await removeDevice(subscription);
  expect(await db.select().from(pushSubscriptions)).toHaveLength(0);
});
