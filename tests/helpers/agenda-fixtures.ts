import { randomUUID } from "node:crypto";
import { bookings, customers, professionals, tenants } from "@/db/schema";
import type { Db } from "@/db/types";
import { getDefaultPlanId } from "@/server/platform/plans";

/** Instante de teste: `at("10:00")` = 2030-01-07 10:00 UTC (segunda-feira). */
export function at(hhmm: string): Date {
  return new Date(`2030-01-07T${hhmm}:00.000Z`);
}

export async function seedTenant(
  db: Db,
  slug = `loja-${randomUUID().slice(0, 8)}`,
) {
  const [tenant] = await db
    .insert(tenants)
    .values({
      slug,
      name: slug,
      trialEndsAt: new Date(Date.now() + 86_400_000),
      planId: await getDefaultPlanId(db),
    })
    .returning();
  return tenant;
}

export async function seedProfessional(db: Db, tenantId: string, name = "Bia") {
  const [professional] = await db
    .insert(professionals)
    .values({ tenantId, name })
    .returning();
  return professional;
}

export async function seedCustomer(
  db: Db,
  tenantId: string,
  phone = "5511999990000",
) {
  const [customer] = await db
    .insert(customers)
    .values({ tenantId, name: "Cliente", phone })
    .returning();
  return customer;
}

type BookingOverrides = Partial<typeof bookings.$inferInsert>;

/** Valores mínimos de um agendamento (10:00–10:30, sem buffer). */
export function bookingValues(
  tenantId: string,
  professionalId: string,
  customerId: string,
  overrides: BookingOverrides = {},
): typeof bookings.$inferInsert {
  return {
    tenantId,
    professionalId,
    customerId,
    startsAt: at("10:00"),
    endsAt: at("10:30"),
    blockedUntil: at("10:30"),
    source: "panel",
    totalCents: 5000,
    ...overrides,
  };
}

export async function seedBooking(
  db: Db,
  tenantId: string,
  overrides: BookingOverrides = {},
) {
  const pro = await seedProfessional(db, tenantId);
  const cust = await seedCustomer(db, tenantId);
  const [b] = await db
    .insert(bookings)
    .values(bookingValues(tenantId, pro.id, cust.id, overrides))
    .returning();
  return b;
}

