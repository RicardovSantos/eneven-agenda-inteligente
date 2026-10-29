import { eq } from "drizzle-orm";
import { beforeEach, describe, expect, it } from "vitest";
import { bookingServices, bookings, professionals } from "@/db/schema";
import type { Db } from "@/db/types";
import { getDashboard } from "@/server/dashboard/overview";
import { bookingValues, seedCustomer, seedProfessional, seedTenant } from "../helpers/agenda-fixtures";
import { createTestDb } from "../helpers/test-db";

const TZ = "America/Sao_Paulo";
const NOW = new Date("2026-10-27T15:00:00-03:00");

let db: Db;
let tenantId: string;
let professionalId: string;
let customerId: string;

type Status = (typeof bookings.$inferInsert)["status"];

async function book(
  startLocal: string,
  status: Status,
  totalCents = 5000,
  services: Array<{ name: string; priceCents: number }> = [],
  pro = professionalId,
) {
  const startsAt = new Date(`${startLocal}-03:00`);
  const endsAt = new Date(startsAt.getTime() + 30 * 60_000);
  const [row] = await db
    .insert(bookings)
    .values(
      bookingValues(tenantId, pro, customerId, {
        startsAt,
        endsAt,
        blockedUntil: endsAt,
        status,
        totalCents,
      }),
    )
    .returning();
  for (const [position, s] of services.entries()) {
    await db.insert(bookingServices).values({
      tenantId,
      bookingId: row.id,
      name: s.name,
      durationMin: 30,
      priceCents: s.priceCents,
      position,
    });
  }
  return row;
}

const dash = (month = "2026-10") => getDashboard(db, { tenantId, month, timezone: TZ, now: NOW });

beforeEach(async () => {
  db = await createTestDb();
  tenantId = (await seedTenant(db)).id;
  professionalId = (await seedProfessional(db, tenantId)).id;
  customerId = (await seedCustomer(db, tenantId)).id;
});

describe("getDashboard", () => {
  it("usa os limites do mês no fuso do estabelecimento", async () => {
    await book("2026-10-31T23:30:00", "completed", 1000);
    await book("2026-10-01T00:30:00", "completed", 2000);
    await book("2026-09-30T23:30:00", "completed", 4000);
    await book("2026-11-01T00:30:00", "completed", 8000);
    const d = await dash();
    expect(d.realizedCents).toBe(3000);
    expect(d.completedCount).toBe(2);
    expect(d.previousRealizedCents).toBe(4000);
    expect(d.perDay).toHaveLength(31);
    expect(d.perDay.find((p) => p.date === "2026-10-31")?.count).toBe(1);
    expect(d.perDay.find((p) => p.date === "2026-10-01")?.count).toBe(1);
    expect(d.averageTicketCents).toBe(1500);
  });

  it("realizedCents só soma completed", async () => {
    await book("2026-10-02T10:00:00", "completed", 1000);
    await book("2026-10-03T10:00:00", "scheduled", 2000);
    await book("2026-10-04T10:00:00", "no_show", 4000);
    await book("2026-10-05T10:00:00", "canceled", 8000);
    expect((await dash()).realizedCents).toBe(1000);
  });

  it("next30 conta scheduled/confirmed de agora até +30 dias e ignora ontem", async () => {
    await book("2026-10-26T10:00:00", "scheduled", 1000);
    await book("2026-10-28T10:00:00", "scheduled", 2000);
    await book("2026-11-20T10:00:00", "confirmed", 4000);
    await book("2026-11-27T10:00:00", "scheduled", 8000);
    await book("2026-10-29T10:00:00", "completed", 16000);
    const d = await dash();
    expect(d.next30).toEqual({ count: 2, cents: 6000, until: "2026-11-26" });
  });

  it("calcula faltas (3 de 87)", async () => {
    const rows = Array.from({ length: 87 }, (_, i) => {
      const day = String((i % 28) + 1).padStart(2, "0");
      const hour = String(8 + Math.floor(i / 28) * 2).padStart(2, "0");
      const startsAt = new Date(`2026-10-${day}T${hour}:00:00-03:00`);
      const endsAt = new Date(startsAt.getTime() + 30 * 60_000);
      return bookingValues(tenantId, professionalId, customerId, {
        startsAt,
        endsAt,
        blockedUntil: endsAt,
        status: i < 3 ? "no_show" : "completed",
        totalCents: 1000,
      });
    });
    await db.insert(bookings).values(rows);
    const d = await dash();
    expect(d.noShow.count).toBe(3);
    expect(d.noShow.base).toBe(87);
    expect(d.noShow.rate).toBeCloseTo(0.0345, 4);
  });

  it("cancelados entram em canceled e saem de bookingsCount", async () => {
    await book("2026-10-02T10:00:00", "completed");
    await book("2026-10-03T10:00:00", "confirmed");
    await book("2026-10-04T10:00:00", "canceled");
    await book("2026-10-05T10:00:00", "canceled");
    await book("2026-09-05T10:00:00", "scheduled");
    const d = await dash();
    expect(d.bookingsCount).toBe(2);
    expect(d.previousBookingsCount).toBe(1);
    expect(d.canceled).toEqual({ count: 2, rate: 0.5 });
    expect(d.perDay.find((p) => p.date === "2026-10-04")?.count).toBe(0);
  });

  it("marca past até hoje (inclusive)", async () => {
    const d = await dash();
    expect(d.perDay.find((p) => p.date === "2026-10-27")?.past).toBe(true);
    expect(d.perDay.find((p) => p.date === "2026-10-28")?.past).toBe(false);
    expect(d.perDay.find((p) => p.date === "2026-10-01")?.past).toBe(true);
  });

  it("topServices soma itens de booking_services dos concluídos", async () => {
    await book("2026-10-02T10:00:00", "completed", 9000, [
      { name: "Corte", priceCents: 5000 },
      { name: "Barba", priceCents: 4000 },
    ]);
    await book("2026-10-03T10:00:00", "completed", 5000, [{ name: "Corte", priceCents: 5000 }]);
    await book("2026-10-04T10:00:00", "scheduled", 3000, [{ name: "Escova", priceCents: 3000 }]);
    const d = await dash();
    expect(d.topServices).toEqual([
      { name: "Corte", count: 2, cents: 10000 },
      { name: "Barba", count: 1, cents: 4000 },
    ]);
  });

  it("topServices desempata por nome e limita a 5", async () => {
    // inseridos em ordem alfabética reversa, todos com a mesma contagem
    for (const [i, name] of ["Zeta", "Eta", "Beta", "Alfa"].entries()) {
      await book(`2026-10-0${i + 2}T10:00:00`, "completed", 1000, [{ name, priceCents: 1000 }]);
    }
    expect((await dash()).topServices.map((s) => s.name)).toEqual(["Alfa", "Beta", "Eta", "Zeta"]);

    // seis serviços: o de menor contagem fica de fora
    await book("2026-10-10T10:00:00", "completed", 1000, [{ name: "Zeta", priceCents: 1000 }]);
    await book("2026-10-11T10:00:00", "completed", 1000, [{ name: "Eta", priceCents: 1000 }]);
    await book("2026-10-12T10:00:00", "completed", 1000, [{ name: "Beta", priceCents: 1000 }]);
    await book("2026-10-13T10:00:00", "completed", 1000, [{ name: "Alfa", priceCents: 1000 }]);
    await book("2026-10-14T10:00:00", "completed", 1000, [{ name: "Gama", priceCents: 1000 }]);
    await book("2026-10-15T10:00:00", "completed", 1000, [{ name: "Delta", priceCents: 1000 }]);
    const top = (await dash()).topServices;
    expect(top).toHaveLength(5);
    expect(top.map((s) => s.name)).toEqual(["Alfa", "Beta", "Eta", "Zeta", "Delta"]);
  });

  it("perProfessional lista quem atendeu, inclusive inativos, por cents desc", async () => {
    const other = await seedProfessional(db, tenantId, "Ana");
    const idle = await seedProfessional(db, tenantId, "Sem agenda");
    await book("2026-10-02T10:00:00", "completed", 1000);
    await book("2026-10-03T10:00:00", "no_show", 1000);
    await book("2026-10-02T10:00:00", "completed", 7000, [], other.id);
    const inactive = await seedProfessional(db, tenantId, "Carla");
    await db.update(professionals).set({ active: false }).where(eq(professionals.id, inactive.id));
    await book("2026-10-04T10:00:00", "completed", 3000, [], inactive.id);
    const d = await dash();
    expect(d.perProfessional.map((p) => p.name)).toEqual(["Ana", "Carla", "Bia"]);
    expect(d.perProfessional[1]).toMatchObject({ id: inactive.id, completed: 1, cents: 3000 });
    expect(d.perProfessional[0]).toMatchObject({ completed: 1, cents: 7000, noShows: 0 });
    expect(d.perProfessional[2]).toMatchObject({ completed: 1, cents: 1000, noShows: 1 });
    expect(d.perProfessional.some((p) => p.id === idle.id)).toBe(false);
  });

  it("não vaza dados de outro estabelecimento", async () => {
    const other = await seedTenant(db);
    const otherPro = await seedProfessional(db, other.id);
    const otherCustomer = await seedCustomer(db, other.id);
    await db.insert(bookings).values(
      bookingValues(other.id, otherPro.id, otherCustomer.id, {
        startsAt: new Date("2026-10-10T13:00:00Z"),
        endsAt: new Date("2026-10-10T13:30:00Z"),
        blockedUntil: new Date("2026-10-10T13:30:00Z"),
        status: "completed",
      }),
    );
    expect((await dash()).realizedCents).toBe(0);
  });

  it("mês sem dados devolve zeros e rate null", async () => {
    const d = await dash();
    expect(d).toMatchObject({
      realizedCents: 0,
      completedCount: 0,
      averageTicketCents: null,
      previousRealizedCents: 0,
      bookingsCount: 0,
      previousBookingsCount: 0,
      noShow: { count: 0, base: 0, rate: null },
      canceled: { count: 0, rate: null },
      next30: { count: 0, cents: 0 },
      topServices: [],
      perProfessional: [],
    });
    expect(d.perDay).toHaveLength(31);
    expect(d.perDay.every((p) => p.count === 0)).toBe(true);
  });
});
