import { beforeEach, describe, expect, it } from "vitest";
import { desc } from "drizzle-orm";
import { auditLog } from "@/db/schema";
import type { Db } from "@/db/types";
import { listPlans, updatePlan } from "@/server/platform/plans";
import { PlatformError } from "@/server/platform/errors";
import { createTestDb } from "../helpers/test-db";
import { planId, seedPlatformTenant, seedSuperAdmin } from "../helpers/platform-fixtures";

let db: Db;
let actor: { userId: string };
beforeEach(async () => {
  db = await createTestDb();
  actor = { userId: (await seedSuperAdmin(db)).id };
});

describe("planos", () => {
  it("lista os 3 planos com valores e contagem de estabelecimentos", async () => {
    await seedPlatformTenant(db);
    await seedPlatformTenant(db, { plan: "studio" });
    await seedPlatformTenant(db);
    const list = await listPlans(db);
    expect(list.map((p) => [p.code, p.priceCents, p.maxProfessionals, p.monthlyMessages, p.tenantCount])).toEqual([
      ["essencial", 3990, 2, 300, 2],
      ["profissional", 6990, 6, 800, 0],
      ["studio", 10990, null, 1500, 1],
    ]);
  });

  it("updatePlan altera e grava auditoria com antes/depois", async () => {
    const id = await planId(db, "profissional");
    await updatePlan(db, actor, id, { name: "Pro", priceCents: 7490, maxProfessionals: null, monthlyMessages: 900, active: false });
    const p = (await listPlans(db)).find((x) => x.id === id)!;
    expect(p).toMatchObject({ name: "Pro", priceCents: 7490, maxProfessionals: null, monthlyMessages: 900, active: false });
    const [a] = await db.select().from(auditLog).orderBy(desc(auditLog.id)).limit(1);
    expect(a).toMatchObject({ action: "plan.updated", actorUserId: actor.userId, tenantId: null });
    expect(a.details).toMatchObject({ planId: id, from: { priceCents: 6990 }, to: { priceCents: 7490 } });
  });

  it("valida e recusa plano inexistente", async () => {
    const id = await planId(db, "essencial");
    const bad = { name: "", priceCents: -1, maxProfessionals: 0, monthlyMessages: 1.5, active: true };
    await expect(updatePlan(db, actor, id, bad)).rejects.toBeInstanceOf(PlatformError);
    await expect(
      updatePlan(db, actor, "00000000-0000-0000-0000-000000000000", { name: "x", priceCents: 1, maxProfessionals: 1, monthlyMessages: 1, active: true }),
    ).rejects.toMatchObject({ code: "not_found" });
  });
});
