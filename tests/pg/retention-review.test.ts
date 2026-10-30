import { eq } from "drizzle-orm";
import { afterAll, beforeEach, expect, it } from "vitest";
import { auditLog, tenants } from "@/db/schema";
import { listRetentionReview } from "@/server/platform/retention-review";
import { seedTenant } from "../helpers/agenda-fixtures";
import { connectPg } from "./pg-db";

const pg = connectPg();
beforeEach(() => pg.truncate());
afterAll(() => pg.close());

it("considera o último cancelamento registrado no PostgreSQL", async () => {
  const tenant = await seedTenant(pg.db);
  await pg.db.update(tenants).set({ status: "canceled" }).where(eq(tenants.id, tenant.id));
  await pg.db.insert(auditLog).values([{ tenantId: tenant.id, action: "tenant.canceled", createdAt: new Date("2029-01-01T00:00:00Z") }, { tenantId: tenant.id, action: "tenant.canceled", createdAt: new Date("2030-04-01T00:00:00Z") }]);
  expect(await listRetentionReview(pg.db, new Date("2030-05-01T00:00:00Z"))).toEqual([]);
  expect((await listRetentionReview(pg.db, new Date("2030-08-01T00:00:00Z"))).map((row) => row.id)).toEqual([tenant.id]);
});
