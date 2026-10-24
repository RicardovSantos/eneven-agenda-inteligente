import { describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import { bookings, customers, tenants } from "@/db/schema";
import { isExclusionViolation, isUniqueViolation } from "@/server/db-errors";
import {
  at,
  bookingValues,
  seedCustomer,
  seedProfessional,
  seedTenant,
} from "../helpers/agenda-fixtures";
import { createTestDb } from "../helpers/test-db";

async function setup() {
  const db = await createTestDb();
  const tenant = await seedTenant(db);
  const bia = await seedProfessional(db, tenant.id, "Bia");
  const cris = await seedProfessional(db, tenant.id, "Cris");
  const customer = await seedCustomer(db, tenant.id);
  const values = (
    professionalId: string,
    over: Partial<typeof bookings.$inferInsert> = {},
  ) => bookingValues(tenant.id, professionalId, customer.id, over);
  return { db, tenant, bia, cris, customer, values };
}

const failure = (promise: PromiseLike<unknown>) =>
  Promise.resolve(promise).then(
    () => null,
    (e: unknown) => e,
  );

describe("trava de dupla reserva (bookings_no_overlap)", () => {
  it("rejeita agendamentos sobrepostos do mesmo profissional com 23P01", async () => {
    const { db, bia, values } = await setup();
    await db.insert(bookings).values(values(bia.id));
    const error = await failure(
      db.insert(bookings).values(
        values(bia.id, {
          startsAt: at("10:15"),
          endsAt: at("10:45"),
          blockedUntil: at("10:45"),
        }),
      ),
    );
    expect(error).not.toBeNull();
    expect((error as { cause?: { code?: string } }).cause?.code).toBe("23P01");
    expect(isExclusionViolation(error)).toBe(true);
  });

  it("considera o buffer (blocked_until) na sobreposição", async () => {
    const { db, bia, values } = await setup();
    await db.insert(bookings).values(values(bia.id, { blockedUntil: at("10:45") }));
    const error = await failure(
      db.insert(bookings).values(
        values(bia.id, {
          startsAt: at("10:30"),
          endsAt: at("11:00"),
          blockedUntil: at("11:00"),
        }),
      ),
    );
    expect(isExclusionViolation(error)).toBe(true);
  });

  it("permite sobreposição entre profissionais diferentes", async () => {
    const { db, bia, cris, values } = await setup();
    await db.insert(bookings).values(values(bia.id));
    await expect(db.insert(bookings).values(values(cris.id))).resolves.toBeDefined();
  });

  it("ignora agendamento cancelado", async () => {
    const { db, bia, values } = await setup();
    await db.insert(bookings).values(values(bia.id, { status: "canceled" }));
    await expect(db.insert(bookings).values(values(bia.id))).resolves.toBeDefined();
  });

  it("libera o horário quando o agendamento existente é cancelado depois", async () => {
    const { db, bia, values } = await setup();
    const [first] = await db.insert(bookings).values(values(bia.id)).returning();
    await db
      .update(bookings)
      .set({ status: "canceled" })
      .where(eq(bookings.id, first.id));
    await expect(db.insert(bookings).values(values(bia.id))).resolves.toBeDefined();
  });

  it("permite agendamentos encostados (10:00–10:30 e 10:30–11:00)", async () => {
    const { db, bia, values } = await setup();
    await db.insert(bookings).values(values(bia.id));
    await expect(
      db.insert(bookings).values(
        values(bia.id, {
          startsAt: at("10:30"),
          endsAt: at("11:00"),
          blockedUntil: at("11:00"),
        }),
      ),
    ).resolves.toBeDefined();
  });
});

describe("restrições do esquema da agenda", () => {
  it("define os padrões novos de tenants", async () => {
    const { db, tenant } = await setup();
    const [row] = await db.select().from(tenants).where(eq(tenants.id, tenant.id));
    expect(row).toMatchObject({
      slotIntervalMin: 15,
      minNoticeMin: 60,
      maxDaysAhead: 60,
      cancelWindowMin: 120,
      onboardingCompletedAt: null,
    });
  });

  it("rejeita cliente repetido (mesmo telefone) no mesmo tenant, mas aceita em outro", async () => {
    const { db, tenant, customer } = await setup();
    const error = await failure(
      db
        .insert(customers)
        .values({ tenantId: tenant.id, name: "Outra", phone: customer.phone }),
    );
    expect(isUniqueViolation(error, "customers_tenant_phone_unique")).toBe(true);

    const other = await seedTenant(db);
    await expect(seedCustomer(db, other.id, customer.phone)).resolves.toBeDefined();
  });

  it("aplica status padrão 'scheduled' e rejeita manageTokenHash repetido", async () => {
    const { db, bia, cris, values } = await setup();
    const [a] = await db
      .insert(bookings)
      .values(values(bia.id, { manageTokenHash: "abc" }))
      .returning();
    expect(a.status).toBe("scheduled");
    const error = await failure(
      db.insert(bookings).values(values(cris.id, { manageTokenHash: "abc" })),
    );
    expect(isUniqueViolation(error, "bookings_manage_token_hash_unique")).toBe(true);
  });
});
