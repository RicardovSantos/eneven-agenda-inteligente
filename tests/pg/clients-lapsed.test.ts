import { afterAll, beforeEach, expect, it } from "vitest";
import { memberships, users } from "@/db/schema";
import { LAPSED_DAYS, listClients } from "@/server/clients";
import { seedBooking, seedTenant } from "../helpers/agenda-fixtures";
import { connectPg } from "./pg-db";

const pg = connectPg();
beforeEach(() => pg.truncate());
afterAll(() => pg.close());

const NOW = new Date("2030-06-01T12:00:00.000Z");
const daysAgo = (n: number) => new Date(NOW.getTime() - n * 86_400_000);

// Com o driver postgres-js (como em produção), o filtro "Sem voltar há 60 dias" dava
// "The string argument must be of type string ... Received an instance of Date".
it("filtro de clientes que sumiram funciona no PostgreSQL real", async () => {
  const tenant = await seedTenant(pg.db);
  const [owner] = await pg.db.insert(users).values({ name: "Dona", email: "dona@example.com" }).returning();
  await pg.db.insert(memberships).values({ userId: owner.id, tenantId: tenant.id, role: "owner" });
  const at = (n: number) => {
    const start = daysAgo(n);
    return { startsAt: start, endsAt: new Date(start.getTime() + 1_800_000), blockedUntil: new Date(start.getTime() + 1_800_000), status: "completed" as const };
  };
  const old = await seedBooking(pg.db, tenant.id, at(LAPSED_DAYS + 5));
  await seedBooking(pg.db, tenant.id, at(LAPSED_DAYS - 5));

  const result = await listClients(pg.db, { tenantId: tenant.id, userId: owner.id, role: "owner" }, { filter: "lapsed", page: 1, now: NOW });
  expect(result.items.map((item) => item.id)).toEqual([old.customerId]);
  expect(result.total).toBe(1);
});
