import { beforeEach, describe, expect, it } from "vitest";
import { bookingServices, bookings } from "@/db/schema";
import type { Db } from "@/db/types";
import { listPendingOutcomes } from "@/server/dashboard/pending";
import { bookingValues, seedCustomer, seedProfessional, seedTenant } from "../helpers/agenda-fixtures";
import { createTestDb } from "../helpers/test-db";

const NOW = new Date("2026-10-27T15:00:00-03:00");
const HOUR = 3_600_000;
const DAY = 24 * HOUR;

let db: Db;
let tenantId: string;
let professionalId: string;
let customerId: string;

async function book(startsAt: Date, status: "scheduled" | "confirmed" | "completed", services: string[] = []) {
  const endsAt = new Date(startsAt.getTime() + 30 * 60_000);
  const [row] = await db
    .insert(bookings)
    .values(
      bookingValues(tenantId, professionalId, customerId, {
        startsAt,
        endsAt,
        blockedUntil: endsAt,
        status,
      }),
    )
    .returning();
  for (const [position, name] of services.entries()) {
    await db
      .insert(bookingServices)
      .values({ tenantId, bookingId: row.id, name, durationMin: 30, priceCents: 1000, position });
  }
  return row;
}

beforeEach(async () => {
  db = await createTestDb();
  tenantId = (await seedTenant(db)).id;
  professionalId = (await seedProfessional(db, tenantId)).id;
  customerId = (await seedCustomer(db, tenantId)).id;
});

describe("listPendingOutcomes", () => {
  it("traz o confirmado de anteontem, sem concluídos nem futuros", async () => {
    const old = await book(new Date(NOW.getTime() - 2 * DAY), "confirmed", ["Corte", "Barba"]);
    await book(new Date(NOW.getTime() - 3 * DAY), "completed");
    await book(new Date(NOW.getTime() + HOUR), "scheduled");
    const list = await listPendingOutcomes(db, tenantId, NOW);
    expect(list).toHaveLength(1);
    expect(list[0]).toMatchObject({
      bookingId: old.id,
      customerName: "Cliente",
      professionalName: "Bia",
      services: ["Corte", "Barba"],
    });
  });

  it("ignora o que passou de 90 dias e ordena do mais antigo", async () => {
    await book(new Date(NOW.getTime() - 100 * DAY), "scheduled");
    const a = await book(new Date(NOW.getTime() - 5 * DAY), "scheduled");
    const b = await book(new Date(NOW.getTime() - 10 * DAY), "confirmed");
    const list = await listPendingOutcomes(db, tenantId, NOW);
    expect(list.map((p) => p.bookingId)).toEqual([b.id, a.id]);
  });

  it("não lista o que já começou mas ainda não terminou", async () => {
    await book(new Date(NOW.getTime() - 10 * 60_000), "scheduled");
    expect(await listPendingOutcomes(db, tenantId, NOW)).toEqual([]);
  });

  it("limita a 50, dos mais antigos", async () => {
    const rows = Array.from({ length: 55 }, (_, i) => {
      const startsAt = new Date(NOW.getTime() - (60 - i) * HOUR);
      const endsAt = new Date(startsAt.getTime() + 30 * 60_000);
      return bookingValues(tenantId, professionalId, customerId, {
        startsAt,
        endsAt,
        blockedUntil: endsAt,
        status: "scheduled",
      });
    });
    await db.insert(bookings).values(rows);
    const list = await listPendingOutcomes(db, tenantId, NOW);
    expect(list).toHaveLength(50);
    expect(list[0].startsAt.getTime()).toBe(NOW.getTime() - 60 * HOUR);
  });
});
