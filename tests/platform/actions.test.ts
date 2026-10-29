import { beforeEach, describe, expect, it } from "vitest";
import { desc, eq } from "drizzle-orm";
import { auditLog, memberships, plans, tenants, users } from "@/db/schema";
import type { Db } from "@/db/types";
import {
  activateTenant, blockTenant, cancelTenant, changePlan, createTenantByAdmin, extendTrial,
} from "@/server/platform/actions";
import { PlatformError } from "@/server/platform/errors";
import { createTestDb } from "../helpers/test-db";
import { DAY, NOW, planId, seedPlatformTenant, seedSuperAdmin } from "../helpers/platform-fixtures";

let db: Db;
let actor: { userId: string };
beforeEach(async () => {
  db = await createTestDb();
  actor = { userId: (await seedSuperAdmin(db)).id };
});

const tenantRow = async (id: string) =>
  (await db.select().from(tenants).where(eq(tenants.id, id)))[0];
const lastAudit = async () =>
  (await db.select().from(auditLog).orderBy(desc(auditLog.id)).limit(1))[0];

async function failure(p: Promise<unknown>): Promise<PlatformError> {
  try {
    await p;
  } catch (e) {
    expect(e).toBeInstanceOf(PlatformError);
    return e as PlatformError;
  }
  throw new Error("esperava PlatformError");
}

describe("extendTrial", () => {
  it("teste vencido em read_only, nunca ativou: volta a trial com now + 7 dias", async () => {
    const { tenant } = await seedPlatformTenant(db, { status: "read_only", trialEndsAt: new Date(NOW.getTime() - 5 * DAY) });
    await extendTrial(db, actor, tenant.id, 7, NOW);
    const t = await tenantRow(tenant.id);
    expect(t.status).toBe("trial");
    expect(t.trialEndsAt).toEqual(new Date(NOW.getTime() + 7 * DAY));
    expect(await lastAudit()).toMatchObject({ action: "tenant.trial_extended", tenantId: tenant.id, actorUserId: actor.userId });
  });

  it("teste em andamento soma ao prazo atual", async () => {
    const end = new Date(NOW.getTime() + 3 * DAY);
    const { tenant } = await seedPlatformTenant(db, { trialEndsAt: end });
    await extendTrial(db, actor, tenant.id, 14, NOW);
    expect((await tenantRow(tenant.id)).trialEndsAt).toEqual(new Date(end.getTime() + 14 * DAY));
    expect((await tenantRow(tenant.id)).status).toBe("trial");
  });

  it("recusa ativo, cancelado e read_only que já foi ativo", async () => {
    for (const [status, activatedAt] of [
      ["active", NOW], ["canceled", null], ["read_only", NOW], ["past_due", NOW],
    ] as const) {
      const { tenant } = await seedPlatformTenant(db, { status, activatedAt });
      const err = await failure(extendTrial(db, actor, tenant.id, 7, NOW));
      expect(err.message).toBe("Este estabelecimento não está em teste.");
    }
  });

  it("recusa dias fora de 7/14/30 e tenant inexistente", async () => {
    const { tenant } = await seedPlatformTenant(db);
    await failure(extendTrial(db, actor, tenant.id, 10 as 7, NOW));
    await failure(extendTrial(db, actor, "00000000-0000-0000-0000-000000000000", 7, NOW));
  });
});

describe("ativar, bloquear, cancelar, trocar plano", () => {
  it("activateTenant define activated_at só na primeira vez", async () => {
    const { tenant } = await seedPlatformTenant(db);
    await activateTenant(db, actor, tenant.id, NOW);
    let t = await tenantRow(tenant.id);
    expect(t.status).toBe("active");
    expect(t.activatedAt).toEqual(NOW);
    expect(await lastAudit()).toMatchObject({ action: "tenant.activated" });
    await blockTenant(db, actor, tenant.id);
    expect(await lastAudit()).toMatchObject({ action: "tenant.blocked", details: { from: "active", to: "read_only" } });
    await activateTenant(db, actor, tenant.id, new Date(NOW.getTime() + DAY));
    t = await tenantRow(tenant.id);
    expect(t.activatedAt).toEqual(NOW);
  });

  it("cancelTenant", async () => {
    const { tenant } = await seedPlatformTenant(db);
    await cancelTenant(db, actor, tenant.id);
    expect((await tenantRow(tenant.id)).status).toBe("canceled");
    expect(await lastAudit()).toMatchObject({ action: "tenant.canceled", tenantId: tenant.id });
  });

  it("changePlan grava auditoria e recusa plano inexistente", async () => {
    const { tenant } = await seedPlatformTenant(db);
    const studio = await planId(db, "studio");
    await changePlan(db, actor, tenant.id, studio);
    expect((await tenantRow(tenant.id)).planId).toBe(studio);
    expect(await lastAudit()).toMatchObject({ action: "tenant.plan_changed" });
    const err = await failure(changePlan(db, actor, tenant.id, "00000000-0000-0000-0000-000000000000"));
    expect(err.code).toBe("not_found");
  });

  it("changePlan recusa plano inativo", async () => {
    const { tenant } = await seedPlatformTenant(db);
    const studio = await planId(db, "studio");
    await db.update(plans).set({ active: false }).where(eq(plans.id, studio));
    const err = await failure(changePlan(db, actor, tenant.id, studio));
    expect(err.message).toMatch(/inativo/);
  });

  it("ação em estabelecimento inexistente não grava auditoria", async () => {
    await failure(blockTenant(db, actor, "00000000-0000-0000-0000-000000000000"));
    expect(await db.select().from(auditLog)).toHaveLength(0);
  });
});

describe("createTenantByAdmin", () => {
  const input = async () => ({
    businessName: "Salão Nova", ownerName: "Maria", ownerEmail: " Maria@Exemplo.COM ",
    whatsapp: "(11) 99999-9999", planId: await planId(db, "profissional"), trialDays: 30,
  });

  it("cria tenant sem senha, no plano e prazo pedidos, com auditoria", async () => {
    const r = await createTenantByAdmin(db, actor, await input(), NOW);
    const t = await tenantRow(r.tenantId);
    expect(t.planId).toBe(await planId(db, "profissional"));
    expect(t.status).toBe("trial");
    expect(t.trialEndsAt).toEqual(new Date(NOW.getTime() + 30 * DAY));
    expect(t.whatsapp).toBe("5511999999999");
    const [u] = await db.select().from(users).where(eq(users.id, r.userId));
    expect(u).toMatchObject({ email: "maria@exemplo.com", passwordHash: null, emailVerifiedAt: null });
    const [m] = await db.select().from(memberships).where(eq(memberships.userId, r.userId));
    expect(m.role).toBe("owner");
    expect(await lastAudit()).toMatchObject({ action: "tenant.created_by_admin", tenantId: r.tenantId });
  });

  it("e-mail existente -> erro", async () => {
    await createTenantByAdmin(db, actor, await input(), NOW);
    const err = await failure(createTenantByAdmin(db, actor, { ...(await input()), businessName: "Outro" }, NOW));
    expect(err.message).toBe("Já existe uma conta com esse e-mail.");
    expect(err.code).toBe("email_taken");
  });

  it("valida campos", async () => {
    const base = await input();
    const err = await failure(
      createTenantByAdmin(db, actor, { ...base, businessName: "", whatsapp: "1", trialDays: 91, ownerEmail: "x" }, NOW),
    );
    expect(err.code).toBe("validation");
    expect(Object.keys(err.fieldErrors ?? {}).sort()).toEqual(["businessName", "ownerEmail", "trialDays", "whatsapp"]);
    const e2 = await failure(createTenantByAdmin(db, actor, { ...base, planId: "00000000-0000-0000-0000-000000000000" }, NOW));
    expect(e2.fieldErrors?.planId).toBeTruthy();
  });
});

describe("sem mudança, sem auditoria", () => {
  it("mesmo plano e mesmo estado não gravam linha", async () => {
    const { tenant } = await seedPlatformTenant(db);
    await changePlan(db, actor, tenant.id, tenant.planId);
    await blockTenant(db, actor, tenant.id);
    await blockTenant(db, actor, tenant.id);
    expect(await db.select().from(auditLog)).toHaveLength(1);
  });
});
