import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { sql } from "drizzle-orm";
import { bookings, users } from "@/db/schema";
import { isExclusionViolation } from "@/server/db-errors";
import { withTenant } from "@/server/tenant-db";
import {
  at,
  bookingValues,
  seedCustomer,
  seedProfessional,
  seedTenant,
} from "../helpers/agenda-fixtures";
import { connectPg } from "./pg-db";

const pg = connectPg();
const { db } = pg;

beforeEach(async () => {
  await pg.truncate();
});

afterAll(async () => {
  await pg.close();
});

async function seed() {
  const a = await seedTenant(db, "loja-a");
  const b = await seedTenant(db, "loja-b");
  const proA = await seedProfessional(db, a.id);
  const proB = await seedProfessional(db, b.id);
  const custA = await seedCustomer(db, a.id);
  const custB = await seedCustomer(db, b.id);
  return { a, b, proA, proB, custA, custB };
}

describe("trava de dupla reserva (PostgreSQL real)", () => {
  it("rejeita sobreposição do mesmo profissional e aceita encostados e cancelados", async () => {
    const { a, proA, custA } = await seed();
    const values = (over: Partial<typeof bookings.$inferInsert> = {}) =>
      bookingValues(a.id, proA.id, custA.id, over);

    await db.insert(bookings).values(values());

    const overlap = await db
      .insert(bookings)
      .values(values({ startsAt: at("10:15"), endsAt: at("10:45"), blockedUntil: at("10:45") }))
      .then(
        () => null,
        (e: unknown) => e,
      );
    expect(isExclusionViolation(overlap)).toBe(true);

    await expect(
      db
        .insert(bookings)
        .values(values({ startsAt: at("10:30"), endsAt: at("11:00"), blockedUntil: at("11:00") })),
    ).resolves.toBeDefined();

    await expect(
      db.insert(bookings).values(values({ status: "canceled" })),
    ).resolves.toBeDefined();
  });

  it("com várias conexões disputando o mesmo horário, só uma reserva vence", async () => {
    const { a, proA, custA } = await seed();
    const attempts = await Promise.allSettled(
      Array.from({ length: 5 }, () =>
        db.insert(bookings).values(bookingValues(a.id, proA.id, custA.id)),
      ),
    );
    const ok = attempts.filter((r) => r.status === "fulfilled");
    const rejected = attempts.filter(
      (r): r is PromiseRejectedResult => r.status === "rejected",
    );
    expect(ok).toHaveLength(1);
    expect(rejected).toHaveLength(4);
    expect(rejected.every((r) => isExclusionViolation(r.reason))).toBe(true);
  });
});

describe("RLS com conexão superusuária (como em produção)", () => {
  it("withTenant isola os tenants mesmo com FORCE RLS ignorado pelo superusuário", async () => {
    const { a, b, proA, proB, custA, custB } = await seed();
    await db.insert(bookings).values(bookingValues(a.id, proA.id, custA.id));
    await db.insert(bookings).values(bookingValues(b.id, proB.id, custB.id));

    const seenByA = await withTenant(db, a.id, (tx) => tx.select().from(bookings));
    expect(seenByA).toHaveLength(1);
    expect(seenByA[0].tenantId).toBe(a.id);

    await expect(
      withTenant(db, a.id, (tx) =>
        tx.insert(bookings).values(bookingValues(b.id, proB.id, custB.id, { startsAt: at("12:00"), endsAt: at("12:30"), blockedUntil: at("12:30") })),
      ),
    ).rejects.toThrow();
  });

  it("agenda_app sem contexto de tenant não vê linhas e não acessa tabelas de autenticação", async () => {
    const { a, proA, custA } = await seed();
    await db.insert(bookings).values(bookingValues(a.id, proA.id, custA.id));

    const rows = await db.transaction(async (tx) => {
      await tx.execute(sql`set local role agenda_app`);
      return tx.select().from(bookings);
    });
    expect(rows).toHaveLength(0);

    await expect(
      withTenant(db, a.id, (tx) => tx.select().from(users)),
    ).rejects.toThrow();
  });

  it("o contexto de tenant não vaza entre usos da mesma conexão", async () => {
    const { a, proA, custA } = await seed();
    await db.insert(bookings).values(bookingValues(a.id, proA.id, custA.id));
    for (let i = 0; i < 10; i++) {
      await withTenant(db, a.id, (tx) => tx.select().from(bookings));
    }
    const rows = await db.transaction(async (tx) => {
      await tx.execute(sql`set local role agenda_app`);
      return tx.select().from(bookings);
    });
    expect(rows).toHaveLength(0);
  });
});
