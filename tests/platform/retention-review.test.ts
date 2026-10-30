import { eq } from "drizzle-orm";
import { expect, it } from "vitest";
import { auditLog, tenants } from "@/db/schema";
import { listRetentionReview } from "@/server/platform/retention-review";
import { seedTenant } from "../helpers/agenda-fixtures";
import { createTestDb } from "../helpers/test-db";

it("lista casos antigos e cancelamentos sem data, com paginação", async () => {
  const db = await createTestDb();
  const trial = await seedTenant(db); const oldCanceled = await seedTenant(db); const recentCanceled = await seedTenant(db); const withoutRecord = await seedTenant(db);
  const now = new Date("2030-05-01T00:00:00Z");
  await db.update(tenants).set({ status: "trial", trialEndsAt: new Date("2030-01-01T00:00:00Z") }).where(eq(tenants.id, trial.id));
  for (const tenant of [oldCanceled, recentCanceled, withoutRecord]) await db.update(tenants).set({ status: "canceled" }).where(eq(tenants.id, tenant.id));
  await db.insert(auditLog).values([
    { tenantId: oldCanceled.id, action: "tenant.canceled", createdAt: new Date("2030-01-01T00:00:00Z") },
    { tenantId: recentCanceled.id, action: "tenant.canceled", createdAt: new Date("2029-01-01T00:00:00Z") },
    { tenantId: recentCanceled.id, action: "tenant.canceled", createdAt: new Date("2030-04-01T00:00:00Z") },
  ]);
  expect((await listRetentionReview(db, now)).items.map((row) => row.id).sort()).toEqual([trial.id, oldCanceled.id, withoutRecord.id].sort());
  expect((await listRetentionReview(db, now, 2)).items).toEqual([]);
  await db.insert(tenants).values(Array.from({ length: 51 }, (_, index) => ({ slug: `inativo-${index}`, name: `Inativo ${index}`, planId: trial.planId, trialEndsAt: new Date("2030-01-01T00:00:00Z") })));
  const first = await listRetentionReview(db, now);
  const second = await listRetentionReview(db, now, 2);
  expect(first.items).toHaveLength(50);
  expect(first.hasMore).toBe(true);
  expect(second.items).toHaveLength(4);
  expect(second.hasMore).toBe(false);
  expect(new Set([...first.items, ...second.items].map((row) => row.id)).size).toBe(54);
});
