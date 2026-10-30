import { afterAll, beforeEach, expect, it } from "vitest";
import { memberships, users } from "@/db/schema";
import { exportTenantAgenda } from "@/server/export/agenda";
import { seedBooking, seedTenant } from "../helpers/agenda-fixtures";
import { connectPg } from "./pg-db";

const pg = connectPg();
beforeEach(() => pg.truncate());
afterAll(() => pg.close());

it("exporta apenas o estabelecimento autorizado sob RLS", async () => {
  const a = await seedTenant(pg.db); const b = await seedTenant(pg.db);
  const [owner] = await pg.db.insert(users).values({ name: "Dona", email: "owner@example.com" }).returning();
  await pg.db.insert(memberships).values({ userId: owner.id, tenantId: a.id, role: "owner" });
  const aBooking = await seedBooking(pg.db, a.id);
  await seedBooking(pg.db, b.id);
  const result = await exportTenantAgenda(pg.db, { userId: owner.id, tenantId: a.id });
  expect(result.bookings.map((booking) => booking.id)).toEqual([aBooking.id]);
  await expect(exportTenantAgenda(pg.db, { userId: owner.id, tenantId: b.id })).rejects.toThrow();
});
