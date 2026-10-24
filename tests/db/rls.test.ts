import { describe, expect, it } from "vitest";
import { sql } from "drizzle-orm";
import { bookings, customers, tenants, users } from "@/db/schema";
import { withTenant } from "@/server/tenant-db";
import {
  bookingValues,
  seedCustomer,
  seedProfessional,
  seedTenant,
} from "../helpers/agenda-fixtures";
import { createTestDb } from "../helpers/test-db";

async function setup() {
  const db = await createTestDb();
  const a = await seedTenant(db, "loja-a");
  const b = await seedTenant(db, "loja-b");
  const proA = await seedProfessional(db, a.id);
  const proB = await seedProfessional(db, b.id);
  const custA = await seedCustomer(db, a.id);
  const custB = await seedCustomer(db, b.id);
  await db.insert(bookings).values(bookingValues(a.id, proA.id, custA.id));
  await db.insert(bookings).values(bookingValues(b.id, proB.id, custB.id));
  return { db, a, b, proA, proB, custA, custB };
}

describe("withTenant e RLS", () => {
  it("só enxerga as linhas do próprio tenant", async () => {
    const { db, a, b } = await setup();
    const seenByA = await withTenant(db, a.id, (tx) => tx.select().from(bookings));
    const seenByB = await withTenant(db, b.id, (tx) => tx.select().from(bookings));
    expect(seenByA).toHaveLength(1);
    expect(seenByA[0].tenantId).toBe(a.id);
    expect(seenByB).toHaveLength(1);
    expect(seenByB[0].tenantId).toBe(b.id);
  });

  it("rejeita insert com tenantId de outro tenant", async () => {
    const { db, a, b, proB, custB } = await setup();
    await expect(
      withTenant(db, a.id, (tx) =>
        tx.insert(bookings).values(bookingValues(b.id, proB.id, custB.id)),
      ),
    ).rejects.toThrow();
  });

  it("update não alcança linhas de outro tenant", async () => {
    const { db, a } = await setup();
    await withTenant(db, a.id, (tx) => tx.update(customers).set({ name: "Mudou" }));
    const all = await db.select().from(customers);
    expect(all.filter((c) => c.name === "Mudou")).toHaveLength(1);
  });

  it("como agenda_app fora de withTenant não há linhas visíveis", async () => {
    const { db } = await setup();
    const rows = await db.transaction(async (tx) => {
      await tx.execute(sql`set local role agenda_app`);
      return tx.select().from(bookings);
    });
    expect(rows).toHaveLength(0);
  });

  it("agenda_app lê tenants, mas não toca em tabelas de autenticação", async () => {
    const { db, a } = await setup();
    const seen = await withTenant(db, a.id, (tx) => tx.select().from(tenants));
    expect(seen.length).toBeGreaterThanOrEqual(1);
    await expect(
      withTenant(db, a.id, (tx) => tx.select().from(users)),
    ).rejects.toThrow();
  });

  it("o tenant do contexto não vaza para fora da transação", async () => {
    const { db, a } = await setup();
    await withTenant(db, a.id, (tx) => tx.select().from(bookings));
    const result = await db.execute(
      sql`select current_setting('app.tenant_id', true) as v`,
    );
    const [row] = (result as unknown as { rows: { v: string | null }[] }).rows;
    expect(row.v ?? "").toBe("");
  });
});
