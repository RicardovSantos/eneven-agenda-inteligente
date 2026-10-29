import { beforeEach, describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import { auditLog, invitations, users } from "@/db/schema";
import type { Db } from "@/db/types";
import { listPlatformTenants, getPlatformTenant } from "@/server/platform/tenants";
import { tenantSituation } from "@/server/tenants/release";
import { createTestDb } from "../helpers/test-db";
import { DAY, NOW, seedPlatformTenant, seedSuperAdmin } from "../helpers/platform-fixtures";

describe("tenantSituation", () => {
  const future = new Date(NOW.getTime() + DAY);
  const past = new Date(NOW.getTime() - DAY);
  it.each([
    [{ status: "trial", trialEndsAt: future }, "trial"],
    [{ status: "trial", trialEndsAt: past }, "trial_expired"],
    [{ status: "active", trialEndsAt: past }, "active"],
    [{ status: "past_due", trialEndsAt: past }, "past_due"],
    [{ status: "read_only", trialEndsAt: future }, "read_only"],
    [{ status: "canceled", trialEndsAt: future }, "canceled"],
  ] as const)("%j -> %s", (t, expected) => {
    expect(tenantSituation(t, NOW)).toBe(expected);
  });
});

describe("listPlatformTenants", () => {
  let db: Db;
  beforeEach(async () => {
    db = await createTestDb();
  });

  it("lista, conta por situação, busca e pagina", async () => {
    await seedPlatformTenant(db, { name: "Studio Bela", status: "active", createdAt: new Date(NOW.getTime() - 3 * DAY) });
    await seedPlatformTenant(db, { name: "Barbearia Zé", ownerEmail: "ze@exemplo.com", createdAt: new Date(NOW.getTime() - 2 * DAY) });
    await seedPlatformTenant(db, { name: "Velho", trialEndsAt: new Date(NOW.getTime() - DAY), createdAt: new Date(NOW.getTime() - DAY) });

    const all = await listPlatformTenants(db, { page: 1, now: NOW });
    expect(all.total).toBe(3);
    expect(all.items.map((i) => i.name)).toEqual(["Velho", "Barbearia Zé", "Studio Bela"]);
    expect(all.counts).toEqual({
      all: 3, trial: 1, trial_expired: 1, active: 1, past_due: 0, read_only: 0, canceled: 0,
    });
    expect(all.items[2]).toMatchObject({ situation: "active", planName: "Essencial", bookings30d: 0 });

    const expired = await listPlatformTenants(db, { page: 1, situation: "trial_expired", now: NOW });
    expect(expired.items.map((i) => i.name)).toEqual(["Velho"]);
    expect(expired.total).toBe(1);
    expect(expired.counts.all).toBe(3);

    const byEmail = await listPlatformTenants(db, { page: 1, query: "ze@exemplo", now: NOW });
    expect(byEmail.items.map((i) => i.name)).toEqual(["Barbearia Zé"]);
    expect(byEmail.items[0].ownerEmail).toBe("ze@exemplo.com");

    const bySlug = await listPlatformTenants(db, { page: 1, query: all.items[2].slug, now: NOW });
    expect(bySlug.items).toHaveLength(1);

    const page2 = await listPlatformTenants(db, { page: 2, now: NOW });
    expect(page2.items).toHaveLength(0);
    expect(page2.total).toBe(3);
  });

  it("não trata % da busca como curinga", async () => {
    await seedPlatformTenant(db, { name: "Loja A" });
    const r = await listPlatformTenants(db, { page: 1, query: "%", now: NOW });
    expect(r.items).toHaveLength(0);
  });
});

describe("getPlatformTenant", () => {
  it("devolve dono, convite pendente, uso e auditoria (mais nova primeiro)", async () => {
    const db = await createTestDb();
    const admin = await seedSuperAdmin(db);
    const { tenant, owner } = await seedPlatformTenant(db, { lastLoginAt: NOW });
    await db.update(users).set({ passwordHash: null }).where(eq(users.id, owner.id));
    await db.insert(invitations).values({
      tenantId: tenant.id, email: "dono@x.com", name: "Dono", role: "owner",
      tokenHash: "h1", expiresAt: new Date(NOW.getTime() + DAY), sentAt: NOW,
    });
    await db.insert(invitations).values({
      tenantId: tenant.id, email: "velho@x.com", name: "Velho", role: "owner",
      tokenHash: "h2", expiresAt: new Date(NOW.getTime() - DAY),
    });
    for (let i = 0; i < 22; i++) {
      await db.insert(auditLog).values({
        actorUserId: admin.id, tenantId: tenant.id, action: `a.${i}`,
        createdAt: new Date(NOW.getTime() + i * 1000),
      });
    }

    const t = await getPlatformTenant(db, tenant.id, NOW);
    expect(t).not.toBeNull();
    expect(t!.owner).toMatchObject({ email: owner.email, hasPassword: false, emailVerified: false });
    expect(t!.owner!.lastLoginAt).toEqual(NOW);
    expect(t!.pendingOwnerInvite).toMatchObject({ email: "dono@x.com" });
    expect(t!.usage).toMatchObject({ bookings30d: 0, customers: 0, activeProfessionals: 0, maxProfessionals: 2, activeServices: 0 });
    expect(t!.audit).toHaveLength(20);
    expect(t!.audit[0].action).toBe("a.21");
    expect(t!.audit[0].actorName).toBe("Ricardo");
  });

  it("id inexistente ou inválido -> null", async () => {
    const db = await createTestDb();
    expect(await getPlatformTenant(db, "00000000-0000-0000-0000-000000000000", NOW)).toBeNull();
    expect(await getPlatformTenant(db, "nao-e-uuid", NOW)).toBeNull();
  });
});

describe("situação desconhecida", () => {
  it("é ignorada (vale como todas)", async () => {
    const db = await createTestDb();
    await seedPlatformTenant(db);
    const r = await listPlatformTenants(db, { page: 1, situation: "bogus" as "trial", now: NOW });
    expect(r.total).toBe(1);
  });
});
