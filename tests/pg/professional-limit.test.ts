import { afterAll, beforeEach, expect, it } from "vitest";
import { saveProfessional } from "@/server/catalog/professionals";
import { emptyWeek } from "@/lib/weekly-hours";
import { seedProfessional, seedTenant } from "../helpers/agenda-fixtures";
import { connectPg } from "./pg-db";

const pg = connectPg();
beforeEach(() => pg.truncate());
afterAll(() => pg.close());

it("não ultrapassa o limite com criações simultâneas", async () => {
  const tenant = await seedTenant(pg.db);
  await seedProfessional(pg.db, tenant.id);
  const input = { name: "Profissional", color: "#B4237A", active: true, serviceIds: [], hours: emptyWeek() };
  const results = await Promise.allSettled([saveProfessional(pg.db, tenant.id, input), saveProfessional(pg.db, tenant.id, input)]);
  expect(results.filter((r) => r.status === "fulfilled")).toHaveLength(1);
  expect(results.filter((r) => r.status === "rejected")).toHaveLength(1);
});
