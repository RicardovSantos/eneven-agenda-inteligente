import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import {
  bookings,
  businessHours,
  professionalHours,
  professionalServices,
  services,
} from "@/db/schema";
import { BookingError, cancelBooking, createBooking, setBookingStatus } from "@/server/agenda/bookings";
import { seedProfessional, seedTenant } from "../helpers/agenda-fixtures";
import { connectPg } from "./pg-db";

const pg = connectPg();
const { db } = pg;

beforeEach(async () => {
  await pg.truncate();
});

afterAll(async () => {
  await pg.close();
});

describe("reservas simultâneas (PostgreSQL real)", () => {
  it("cancelar e confirmar em paralelo: o segundo falha com invalid_transition e canceled não ressuscita", async () => {
    const tenant = await seedTenant(db, "loja-race");
    await db
      .insert(businessHours)
      .values({ tenantId: tenant.id, weekday: 1, startsAt: "09:00", endsAt: "18:00" });
    const [service] = await db
      .insert(services)
      .values({ tenantId: tenant.id, name: "Corte", durationMin: 30, priceCents: 5000 })
      .returning();
    const pro = await seedProfessional(db, tenant.id);
    await db
      .insert(professionalHours)
      .values({ tenantId: tenant.id, professionalId: pro.id, weekday: 1, startsAt: "09:00", endsAt: "18:00" });
    await db
      .insert(professionalServices)
      .values({ tenantId: tenant.id, professionalId: pro.id, serviceId: service.id });
    const now = new Date("2030-01-01T12:00:00.000Z");
    for (let i = 0; i < 10; i++) {
      const { bookingId } = await createBooking(
        db,
        tenant.id,
        {
          serviceIds: [service.id],
          professionalId: pro.id,
          startsAt: new Date(`2030-01-07T${String(9 + (i % 8)).padStart(2, "0")}:${i < 8 ? "00" : "30"}:00.000-03:00`),
          customer: { name: "Ana", phone: "11987654321" },
          source: "public",
        },
        now,
      );
      const results = await Promise.allSettled([
        cancelBooking(db, tenant.id, bookingId, "staff", now),
        setBookingStatus(db, tenant.id, bookingId, "confirmed"),
      ]);
      const [row] = await db.select().from(bookings).where(eq(bookings.id, bookingId));
      for (const r of results) {
        if (r.status === "rejected") expect((r.reason as BookingError).code).toBe("invalid_transition");
      }
      if (row.status === "confirmed") expect(row.canceledAt).toBeNull();
      else expect(row.status).toBe("canceled");
    }
  });

  it("10 createBooking no mesmo horário e profissional: 1 sucesso e 9 slot_taken", async () => {
    const tenant = await seedTenant(db, "loja-conc");
    await db
      .insert(businessHours)
      .values({ tenantId: tenant.id, weekday: 1, startsAt: "09:00", endsAt: "18:00" });
    const [service] = await db
      .insert(services)
      .values({ tenantId: tenant.id, name: "Corte", durationMin: 30, priceCents: 5000 })
      .returning();
    const pro = await seedProfessional(db, tenant.id);
    await db
      .insert(professionalHours)
      .values({ tenantId: tenant.id, professionalId: pro.id, weekday: 1, startsAt: "09:00", endsAt: "18:00" });
    await db
      .insert(professionalServices)
      .values({ tenantId: tenant.id, professionalId: pro.id, serviceId: service.id });

    const startsAt = new Date("2030-01-07T10:00:00.000-03:00");
    const now = new Date("2030-01-01T12:00:00.000Z");
    const results = await Promise.allSettled(
      Array.from({ length: 10 }, (_, i) =>
        createBooking(
          db,
          tenant.id,
          {
            serviceIds: [service.id],
            professionalId: pro.id,
            startsAt,
            customer: { name: `Cliente ${i}`, phone: `1190000${String(1000 + i)}` },
            source: "public",
          },
          now,
        ),
      ),
    );

    const ok = results.filter((r) => r.status === "fulfilled");
    const failed = results.filter((r): r is PromiseRejectedResult => r.status === "rejected");
    expect(ok).toHaveLength(1);
    expect(failed).toHaveLength(9);
    for (const f of failed) {
      expect(f.reason).toBeInstanceOf(BookingError);
      expect((f.reason as BookingError).code).toBe("slot_taken");
    }

    const rows = await db.select().from(bookings).where(eq(bookings.tenantId, tenant.id));
    expect(rows).toHaveLength(1);
  });
});
