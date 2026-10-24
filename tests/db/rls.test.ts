import { describe, expect, it } from "vitest";
import { sql } from "drizzle-orm";
import {
  bookingServices,
  bookings,
  customers,
  professionalServices,
  services,
  tenants,
  timeBlocks,
  users,
} from "@/db/schema";
import { withTenant } from "@/server/tenant-db";
import {
  at,
  bookingValues,
  seedCustomer,
  seedProfessional,
  seedTenant,
} from "../helpers/agenda-fixtures";
import {
  expectEveryAgendaAppTableHasRls,
  expectRlsViolation,
  failure,
  queryRows,
  sqlState,
} from "../helpers/db-assertions";
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
    // Horário diferente do agendamento existente de B: a falha só pode ser o RLS.
    const error = await failure(
      withTenant(db, a.id, (tx) =>
        tx.insert(bookings).values(
          bookingValues(b.id, proB.id, custB.id, {
            startsAt: at("14:00"),
            endsAt: at("14:30"),
            blockedUntil: at("14:30"),
          }),
        ),
      ),
    );
    expectRlsViolation(error);
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

describe("withTenant: papel e catálogo", () => {
  it("o papel volta ao do usuário da sessão depois do withTenant", async () => {
    const { db, a } = await setup();
    const inside = await withTenant(db, a.id, (tx) =>
      queryRows<{ u: string }>(tx as never, sql`select current_user as u`),
    );
    expect(inside[0].u).toBe("agenda_app");
    const [after] = await queryRows<{ u: string; s: string }>(
      db,
      sql`select current_user as u, session_user as s`,
    );
    expect(after.u).toBe(after.s);
    expect(after.u).not.toBe("agenda_app");
  });

  it("toda tabela acessível ao agenda_app (exceto tenants) tem RLS ativo, forçado e política", async () => {
    const db = await createTestDb();
    await expectEveryAgendaAppTableHasRls(db);
  });
});

describe("isolamento de referências entre tenants (FK composta)", () => {
  it("rejeita agendamento do tenant A apontando para profissional ou cliente do B (23503)", async () => {
    const { db, a, proB, custA, proA, custB } = await setup();
    const withProB = await failure(
      withTenant(db, a.id, (tx) =>
        tx.insert(bookings).values(
          bookingValues(a.id, proB.id, custA.id, {
            startsAt: at("15:00"),
            endsAt: at("15:30"),
            blockedUntil: at("15:30"),
          }),
        ),
      ),
    );
    expect(sqlState(withProB)).toBe("23503");

    const withCustB = await failure(
      withTenant(db, a.id, (tx) =>
        tx.insert(bookings).values(
          bookingValues(a.id, proA.id, custB.id, {
            startsAt: at("16:00"),
            endsAt: at("16:30"),
            blockedUntil: at("16:30"),
          }),
        ),
      ),
    );
    expect(sqlState(withCustB)).toBe("23503");
  });

  it("rejeita professional_services, time_blocks e booking_services apontando para outro tenant", async () => {
    const { db, a, b, proA, proB } = await setup();
    const [svcA] = await db
      .insert(services)
      .values({ tenantId: a.id, name: "Corte", durationMin: 30, priceCents: 5000 })
      .returning();
    const [svcB] = await db
      .insert(services)
      .values({ tenantId: b.id, name: "Barba", durationMin: 30, priceCents: 3000 })
      .returning();
    const [bookingB] = await db.select().from(bookings).where(
      sql`${bookings.tenantId} = ${b.id}`,
    );

    // profissional de A com serviço de B
    expect(
      sqlState(
        await failure(
          withTenant(db, a.id, (tx) =>
            tx
              .insert(professionalServices)
              .values({ tenantId: a.id, professionalId: proA.id, serviceId: svcB.id }),
          ),
        ),
      ),
    ).toBe("23503");
    // profissional de B com serviço de A
    expect(
      sqlState(
        await failure(
          withTenant(db, a.id, (tx) =>
            tx
              .insert(professionalServices)
              .values({ tenantId: a.id, professionalId: proB.id, serviceId: svcA.id }),
          ),
        ),
      ),
    ).toBe("23503");
    // bloqueio de A para profissional de B
    expect(
      sqlState(
        await failure(
          withTenant(db, a.id, (tx) =>
            tx.insert(timeBlocks).values({
              tenantId: a.id,
              professionalId: proB.id,
              startsAt: at("12:00"),
              endsAt: at("13:00"),
            }),
          ),
        ),
      ),
    ).toBe("23503");
    // serviço do agendamento de B ligado a um agendamento de A
    expect(
      sqlState(
        await failure(
          withTenant(db, a.id, (tx) =>
            tx.insert(bookingServices).values({
              tenantId: a.id,
              bookingId: bookingB.id,
              name: "Corte",
              durationMin: 30,
              priceCents: 5000,
              position: 0,
            }),
          ),
        ),
      ),
    ).toBe("23503");

    // O caminho legítimo continua funcionando.
    await expect(
      withTenant(db, a.id, (tx) =>
        tx
          .insert(professionalServices)
          .values({ tenantId: a.id, professionalId: proA.id, serviceId: svcA.id }),
      ),
    ).resolves.toBeDefined();
  });

  it("time_blocks sem profissional (estabelecimento todo) continua válido", async () => {
    const { db, a } = await setup();
    await expect(
      withTenant(db, a.id, (tx) =>
        tx.insert(timeBlocks).values({
          tenantId: a.id,
          startsAt: at("12:00"),
          endsAt: at("13:00"),
          reason: "Feriado",
        }),
      ),
    ).resolves.toBeDefined();
  });

  it("apagar um serviço zera só service_id em booking_services (tenant_id intacto)", async () => {
    const { db, a, proA, custA } = await setup();
    const [svc] = await db
      .insert(services)
      .values({ tenantId: a.id, name: "Corte", durationMin: 30, priceCents: 5000 })
      .returning();
    const [booking] = await db
      .insert(bookings)
      .values(
        bookingValues(a.id, proA.id, custA.id, {
          startsAt: at("17:00"),
          endsAt: at("17:30"),
          blockedUntil: at("17:30"),
        }),
      )
      .returning();
    await db.insert(bookingServices).values({
      tenantId: a.id,
      bookingId: booking.id,
      serviceId: svc.id,
      name: "Corte",
      durationMin: 30,
      priceCents: 5000,
      position: 0,
    });
    await db.delete(services);
    const [row] = await db.select().from(bookingServices);
    expect(row.serviceId).toBeNull();
    expect(row.tenantId).toBe(a.id);
  });
});
