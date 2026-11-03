import { afterAll, beforeEach, expect, it } from "vitest";
import { bookings, customers, memberships, users } from "@/db/schema";
import { LAPSED_DAYS, listClients } from "@/server/clients";
import { bookingValues, seedProfessional, seedTenant } from "../helpers/agenda-fixtures";
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
  const pro = await seedProfessional(pg.db, tenant.id);
  const completedBooking = async (name: string, phone: string, n: number) => {
    const [customer] = await pg.db.insert(customers).values({ tenantId: tenant.id, name, phone }).returning();
    const start = daysAgo(n);
    const end = new Date(start.getTime() + 1_800_000);
    await pg.db.insert(bookings).values(bookingValues(tenant.id, pro.id, customer.id, { startsAt: start, endsAt: end, blockedUntil: end, status: "completed" }));
    return customer;
  };
  const old = await completedBooking("A Sumida", "5511911110001", LAPSED_DAYS + 5);
  await completedBooking("B Recente", "5511911110002", LAPSED_DAYS - 5);

  const result = await listClients(pg.db, { tenantId: tenant.id, userId: owner.id, role: "owner" }, { filter: "lapsed", page: 1, now: NOW });
  expect(result.items.map((item) => item.id)).toEqual([old.id]);
  expect(result.total).toBe(1);
});
