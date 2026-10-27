import { beforeEach, describe, expect, it } from "vitest";
import { desc, eq } from "drizzle-orm";
import { auditLog, sessions, users } from "@/db/schema";
import type { Db } from "@/db/types";
import { createSession, destroySession, getSession, hashToken } from "@/server/auth/session";
import { PlatformError } from "@/server/platform/errors";
import { endSupport, startSupport } from "@/server/platform/support";
import { createTestDb } from "../helpers/test-db";
import { DAY, NOW, seedPlatformTenant, seedSuperAdmin } from "../helpers/platform-fixtures";

let db: Db;
beforeEach(async () => {
  db = await createTestDb();
});

const sessionRow = async (token: string) =>
  (await db.select().from(sessions).where(eq(sessions.id, hashToken(token))))[0];
const lastAudit = async () =>
  (await db.select().from(auditLog).orderBy(desc(auditLog.id)).limit(1))[0];

async function setup() {
  const admin = await seedSuperAdmin(db);
  const mine = await seedPlatformTenant(db, { name: "Do Ricardo" });
  // o super-admin tem vínculo com o próprio estabelecimento
  const { memberships } = await import("@/db/schema");
  await db.insert(memberships).values({ userId: admin.id, tenantId: mine.tenant.id, role: "owner" });
  const target = await seedPlatformTenant(db, { name: "Cliente" });
  const token = await createSession(db, admin.id, mine.tenant.id);
  return { admin, mine: mine.tenant, target: target.tenant, token, actor: { userId: admin.id } };
}

describe("modo suporte", () => {
  it("startSupport: getSession devolve o tenant alvo, owner, support true; audita", async () => {
    const { admin, target, token, actor } = await setup();
    await startSupport(db, token, actor, target.id, NOW);
    expect(await getSession(db, token)).toEqual({
      userId: admin.id, tenantId: target.id, role: "owner", isSuperAdmin: true, emailVerified: false, support: true,
    });
    expect((await sessionRow(token)).supportStartedAt).toEqual(NOW);
    expect(await lastAudit()).toMatchObject({ action: "support.started", tenantId: target.id, actorUserId: admin.id });
  });

  it("só mexe na sessão informada (outras do mesmo usuário ficam como estão)", async () => {
    const { admin, mine, target, token, actor } = await setup();
    const other = await createSession(db, admin.id, mine.id);
    await startSupport(db, token, actor, target.id, NOW);
    expect((await sessionRow(other)).tenantId).toBe(mine.id);
    expect((await sessionRow(other)).supportStartedAt).toBeNull();
  });

  it("mesmo registro com usuário sem super-admin: role null", async () => {
    const { admin, target, token, actor } = await setup();
    await startSupport(db, token, actor, target.id, NOW);
    await db.update(users).set({ isSuperAdmin: false }).where(eq(users.id, admin.id));
    const info = await getSession(db, token);
    expect(info).toMatchObject({ tenantId: target.id, role: null, support: true, isSuperAdmin: false });
  });

  it("sessão de suporte sem super-admin não vale mesmo se houver vínculo com o tenant", async () => {
    const t = await seedPlatformTenant(db);
    const token = await createSession(db, t.owner.id, t.tenant.id);
    await db.update(sessions).set({ supportStartedAt: NOW }).where(eq(sessions.id, hashToken(token)));
    expect((await getSession(db, token))?.role).toBeNull();
  });

  it("startSupport recusa quem não é super-admin, tenant inexistente e sessão de outro usuário", async () => {
    const { admin, mine, target, token } = await setup();
    const t = await seedPlatformTenant(db);
    const ownerToken = await createSession(db, t.owner.id, t.tenant.id);
    await expect(startSupport(db, ownerToken, { userId: t.owner.id }, target.id, NOW)).rejects.toBeInstanceOf(PlatformError);
    await expect(
      startSupport(db, token, { userId: admin.id }, "00000000-0000-0000-0000-000000000000", NOW),
    ).rejects.toMatchObject({ code: "not_found" });
    // sessão do dono usada com o ator super-admin: não é a sessão dele
    await expect(startSupport(db, ownerToken, { userId: admin.id }, target.id, NOW)).rejects.toBeInstanceOf(PlatformError);
    expect((await sessionRow(ownerToken)).tenantId).toBe(t.tenant.id);
    expect((await sessionRow(token)).tenantId).toBe(mine.id);
    expect(await db.select().from(auditLog)).toHaveLength(0);
  });

  it("endSupport devolve o tenant do Ricardo, limpa e grava minutos no tenant apoiado", async () => {
    const { admin, mine, target, token, actor } = await setup();
    await startSupport(db, token, actor, target.id, NOW);
    await endSupport(db, token, actor, new Date(NOW.getTime() + 12.4 * 60_000));
    const row = await sessionRow(token);
    expect(row.tenantId).toBe(mine.id);
    expect(row.supportStartedAt).toBeNull();
    expect(await lastAudit()).toMatchObject({
      action: "support.ended", tenantId: target.id, actorUserId: admin.id, details: { minutes: 12 },
    });
    expect(await getSession(db, token)).toMatchObject({ tenantId: mine.id, support: false });
  });

  it("endSupport sem tenant próprio deixa tenant_id nulo; sem suporte ativo, recusa", async () => {
    const admin = await seedSuperAdmin(db);
    const target = (await seedPlatformTenant(db)).tenant;
    const token = await createSession(db, admin.id, null);
    await expect(endSupport(db, token, { userId: admin.id }, NOW)).rejects.toBeInstanceOf(PlatformError);
    await startSupport(db, token, { userId: admin.id }, target.id, NOW);
    await endSupport(db, token, { userId: admin.id }, new Date(NOW.getTime() + DAY));
    expect((await sessionRow(token)).tenantId).toBeNull();
    expect((await lastAudit()).details).toMatchObject({ minutes: 1440 });
  });

  it("destroySession durante o suporte apaga a sessão", async () => {
    const { target, token, actor } = await setup();
    await startSupport(db, token, actor, target.id, NOW);
    await destroySession(db, token);
    expect(await getSession(db, token)).toBeNull();
    expect(await sessionRow(token)).toBeUndefined();
  });
});
