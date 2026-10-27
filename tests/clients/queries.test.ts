import { eq } from "drizzle-orm";
import { beforeEach, describe, expect, it } from "vitest";
import { bookingServices, bookings, customers, memberships, professionals, users } from "@/db/schema";
import type { Db } from "@/db/types";
import type { PanelActor } from "@/server/agenda/panel-ops";
import { searchCustomers } from "@/server/agenda/panel-ops";
import { CLIENTS_PAGE_SIZE, LAPSED_DAYS, getClientProfile, listClients } from "@/server/clients";
import { createTestDb } from "../helpers/test-db";
import { bookingValues } from "../helpers/agenda-fixtures";
import { seedBookable, type PublicSeed } from "../helpers/public-fixtures";

const NOW = new Date("2030-06-01T12:00:00.000Z");
const day = (n: number, hour = 13) => {
  const d = new Date(NOW);
  d.setUTCDate(d.getUTCDate() + n);
  d.setUTCHours(hour, 0, 0, 0);
  return d;
};

let db: Db;
let a: PublicSeed;
let owner: PanelActor;

async function addCustomer(name: string, phone: string, tenantId = a.tenantId) {
  const [c] = await db.insert(customers).values({ tenantId, name, phone }).returning();
  return c;
}

async function addBooking(
  customerId: string,
  startsAt: Date,
  status: (typeof bookings.$inferInsert)["status"],
  opts: { pro?: number; totalCents?: number } = {},
) {
  const end = new Date(startsAt.getTime() + 30 * 60_000);
  const [b] = await db
    .insert(bookings)
    .values(
      bookingValues(a.tenantId, a.proIds[opts.pro ?? 0], customerId, {
        startsAt,
        endsAt: end,
        blockedUntil: end,
        status,
        totalCents: opts.totalCents ?? 5000,
      }),
    )
    .returning();
  return b;
}

beforeEach(async () => {
  db = await createTestDb();
  a = await seedBookable(db, { pros: 2 });
  owner = { tenantId: a.tenantId, userId: a.ownerId, role: "owner" };
});

describe("listClients", () => {
  it("busca por nome e por dígitos do telefone", async () => {
    await addCustomer("Ana Souza", "5511981234321");
    await addCustomer("Bruno", "5511955550000");
    const byPhone = await listClients(db, owner, { query: "98123", filter: "all", page: 1, now: NOW });
    expect(byPhone.items.map((i) => i.name)).toEqual(["Ana Souza"]);
    const byName = await listClients(db, owner, { query: "bru", filter: "all", page: 1, now: NOW });
    expect(byName.items.map((i) => i.name)).toEqual(["Bruno"]);
    expect(byName.total).toBe(1);
  });

  it("visits, totalCents, noShows e datas ignoram cancelados e não contam agendados", async () => {
    const c = await addCustomer("Ana", "5511981234321");
    await addBooking(c.id, day(-10), "completed", { totalCents: 8000 });
    await addBooking(c.id, day(-20), "completed", { totalCents: 2000 });
    await addBooking(c.id, day(-5), "no_show", { totalCents: 7777 });
    await addBooking(c.id, day(-3), "canceled", { totalCents: 9999 });
    await addBooking(c.id, day(-2), "scheduled", { totalCents: 1111 });
    await addBooking(c.id, day(5), "confirmed");
    const { items } = await listClients(db, owner, { filter: "all", page: 1, now: NOW });
    expect(items[0]).toMatchObject({
      visits: 2,
      totalCents: 10000,
      noShows: 1,
      lastVisitAt: day(-10),
      nextBookingAt: day(5),
    });
  });

  it("sem agendamentos: zeros e datas nulas", async () => {
    await addCustomer("Ana", "5511981234321");
    const { items } = await listClients(db, owner, { filter: "all", page: 1, now: NOW });
    expect(items[0]).toMatchObject({ visits: 0, totalCents: 0, noShows: 0, lastVisitAt: null, nextBookingAt: null });
  });

  it("filtros upcoming e lapsed com now fixo", async () => {
    const old = await addCustomer("A Sumida", "5511911110001");
    await addBooking(old.id, day(-(LAPSED_DAYS + 1), 13), "completed");
    const recent = await addCustomer("B Recente", "5511911110002");
    await addBooking(recent.id, day(-(LAPSED_DAYS - 1), 14), "completed");
    const booked = await addCustomer("C Marcada", "5511911110003");
    await addBooking(booked.id, day(-(LAPSED_DAYS + 1), 15), "completed");
    await addBooking(booked.id, day(2), "scheduled");
    const never = await addCustomer("D Nunca", "5511911110004");
    await addBooking(never.id, day(-100, 16), "canceled");

    const lapsed = await listClients(db, owner, { filter: "lapsed", page: 1, now: NOW });
    expect(lapsed.items.map((i) => i.name)).toEqual(["A Sumida"]);
    const upcoming = await listClients(db, owner, { filter: "upcoming", page: 1, now: NOW });
    expect(upcoming.items.map((i) => i.name)).toEqual(["C Marcada"]);
    expect(upcoming.total).toBe(1);
  });

  it("pagina de 50 em 50 com hasMore, ordenado por nome", async () => {
    for (let i = 0; i < CLIENTS_PAGE_SIZE + 1; i++) {
      await addCustomer(`Cliente ${String(i).padStart(3, "0")}`, `55119${String(10000000 + i)}`);
    }
    const p1 = await listClients(db, owner, { filter: "all", page: 1, now: NOW });
    expect(p1.items).toHaveLength(CLIENTS_PAGE_SIZE);
    expect(p1.hasMore).toBe(true);
    expect(p1.total).toBe(CLIENTS_PAGE_SIZE + 1);
    const p2 = await listClients(db, owner, { filter: "all", page: 2, now: NOW });
    expect(p2.items.map((i) => i.name)).toEqual([`Cliente ${String(CLIENTS_PAGE_SIZE).padStart(3, "0")}`]);
    expect(p2.hasMore).toBe(false);
  });

  it("`pages` devolve várias páginas seguidas numa consulta só, com hasMore certo", async () => {
    for (let i = 0; i < CLIENTS_PAGE_SIZE + 1; i++) {
      await addCustomer(`Cliente ${String(i).padStart(3, "0")}`, `55119${String(10000000 + i)}`);
    }
    const one = await listClients(db, owner, { filter: "all", page: 1, pages: 1, now: NOW });
    expect(one.items).toHaveLength(CLIENTS_PAGE_SIZE);
    expect(one.hasMore).toBe(true);
    const two = await listClients(db, owner, { filter: "all", page: 1, pages: 2, now: NOW });
    expect(two.items).toHaveLength(CLIENTS_PAGE_SIZE + 1);
    expect(two.items[CLIENTS_PAGE_SIZE].name).toBe(`Cliente ${String(CLIENTS_PAGE_SIZE).padStart(3, "0")}`);
    expect(two.hasMore).toBe(false);
    expect(two.total).toBe(CLIENTS_PAGE_SIZE + 1);
  });

  it("não vê clientes de outro estabelecimento", async () => {
    const b = await seedBookable(db);
    await addCustomer("De fora", "5511977770000", b.tenantId);
    const { items, total } = await listClients(db, owner, { filter: "all", page: 1, now: NOW });
    expect(items).toEqual([]);
    expect(total).toBe(0);
  });

  it("% e _ na busca são literais (listClients e searchCustomers)", async () => {
    await addCustomer("Ana 100%", "5511911110001");
    await addCustomer("Ana_Lima", "5511911110002");
    await addCustomer("Bruno", "5511911110003");
    const names = async (q: string) =>
      (await listClients(db, owner, { query: q, filter: "all", page: 1, now: NOW })).items.map((i) => i.name);
    expect(await names("%")).toEqual(["Ana 100%"]);
    expect(await names("_")).toEqual(["Ana_Lima"]);
    expect((await searchCustomers(db, owner, "0%")).map((c) => c.name)).toEqual(["Ana 100%"]);
    expect((await searchCustomers(db, owner, "a_")).map((c) => c.name)).toEqual(["Ana_Lima"]);
    expect(await searchCustomers(db, owner, "%%")).toEqual([]);
  });

  describe("staff", () => {
    let staff: PanelActor;
    beforeEach(async () => {
      const [user] = await db
        .insert(users)
        .values({ email: "leo@exemplo.com", name: "Léo", emailVerifiedAt: new Date() })
        .returning();
      await db.insert(memberships).values({ userId: user.id, tenantId: a.tenantId, role: "staff" });
      await db.update(professionals).set({ userId: user.id }).where(eq(professionals.id, a.proIds[1]));
      staff = { tenantId: a.tenantId, userId: user.id, role: "staff" };
    });

    it("só vê clientes que atendeu, conta só os próprios agendamentos e sem receita", async () => {
      const shared = await addCustomer("Ana", "5511981234321");
      await addBooking(shared.id, day(-10), "completed", { pro: 1 });
      await addBooking(shared.id, day(-8), "completed", { pro: 0 });
      const other = await addCustomer("Só da Bia", "5511955550000");
      await addBooking(other.id, day(-7), "completed", { pro: 0 });
      const { items, total } = await listClients(db, staff, { filter: "all", page: 1, now: NOW });
      expect(items.map((i) => i.name)).toEqual(["Ana"]);
      expect(total).toBe(1);
      expect(items[0]).toMatchObject({ visits: 1, totalCents: null, lastVisitAt: day(-10) });
      await expect(getClientProfile(db, staff, other.id, { now: NOW })).rejects.toMatchObject({
        code: "not_found",
        message: "Cliente não encontrado.",
      });
      const profile = await getClientProfile(db, staff, shared.id, { now: NOW });
      expect(profile.totalCents).toBeNull();
      expect(profile.historyTotal).toBe(1);
    });

    it("staff com upcoming/lapsed e nextBookingAt ignora agendamento futuro de outro profissional", async () => {
      const lapsed = await addCustomer("A Sumida", "5511911110001");
      await addBooking(lapsed.id, day(-(LAPSED_DAYS + 1), 13), "completed", { pro: 1 });
      // Futuro, mas com a outra profissional: não conta para o staff.
      await addBooking(lapsed.id, day(3, 13), "scheduled", { pro: 0 });
      const booked = await addCustomer("B Marcada", "5511911110002");
      await addBooking(booked.id, day(-(LAPSED_DAYS + 1), 14), "completed", { pro: 1 });
      await addBooking(booked.id, day(2, 14), "confirmed", { pro: 1 });
      const lapsedList = await listClients(db, staff, { filter: "lapsed", page: 1, now: NOW });
      expect(lapsedList.items.map((i) => i.name)).toEqual(["A Sumida"]);
      expect(lapsedList.items[0].nextBookingAt).toBeNull();
      const upcoming = await listClients(db, staff, { filter: "upcoming", page: 1, now: NOW });
      expect(upcoming.items.map((i) => i.name)).toEqual(["B Marcada"]);
      expect(upcoming.items[0].nextBookingAt).toEqual(day(2, 14));
      expect(upcoming.total).toBe(1);
    });

    it("sem vínculo com profissional não vê nada", async () => {
      await db.update(professionals).set({ userId: null }).where(eq(professionals.id, a.proIds[1]));
      const c = await addCustomer("Ana", "5511981234321");
      await addBooking(c.id, day(-10), "completed", { pro: 1 });
      expect((await listClients(db, staff, { filter: "all", page: 1, now: NOW })).items).toEqual([]);
    });
  });
});

describe("getClientProfile", () => {
  it("returnEveryDays: 01/09, 20/09 e 06/10 -> intervalos 19 e 16 -> 18", async () => {
    const c = await addCustomer("Ana", "5511981234321");
    for (const d of ["2030-09-01", "2030-09-20", "2030-10-06"]) {
      await addBooking(c.id, new Date(`${d}T15:00:00.000Z`), "completed");
    }
    const p = await getClientProfile(db, owner, c.id, { now: new Date("2030-11-01T12:00:00.000Z") });
    expect(p.returnEveryDays).toBe(18);
    expect(p.visits).toBe(3);
  });

  it("returnEveryDays conta dias de calendário no fuso do estabelecimento", async () => {
    // 23:30 e 00:30 locais (UTC-3): 02:30Z e 03:30Z do mesmo dia UTC (02/09).
    // Em UTC seriam 0 dias; em dias de calendário local são 1.
    const c = await addCustomer("Ana", "5511981234321");
    await addBooking(c.id, new Date("2030-09-02T02:30:00.000Z"), "completed");
    await addBooking(c.id, new Date("2030-09-02T03:30:00.000Z"), "completed", { pro: 1 });
    const p = await getClientProfile(db, owner, c.id, { now: new Date("2030-11-01T12:00:00.000Z") });
    expect(p.returnEveryDays).toBe(1);
  });

  it("returnEveryDays é nulo com menos de 2 atendimentos", async () => {
    const c = await addCustomer("Ana", "5511981234321");
    await addBooking(c.id, day(-10), "completed");
    await addBooking(c.id, day(-5), "canceled");
    expect((await getClientProfile(db, owner, c.id, { now: NOW })).returnEveryDays).toBeNull();
  });

  it("histórico: 5 mais recentes primeiro (inclui cancelados), total e serviços em ordem", async () => {
    const c = await addCustomer("Ana", "5511981234321");
    const ids: string[] = [];
    for (let i = 0; i < 7; i++) {
      const b = await addBooking(c.id, day(-30 + i), i === 6 ? "canceled" : "completed");
      ids.push(b.id);
    }
    await db.insert(bookingServices).values([
      { tenantId: a.tenantId, bookingId: ids[6], name: "Barba", durationMin: 30, priceCents: 3000, position: 1 },
      { tenantId: a.tenantId, bookingId: ids[6], name: "Corte", durationMin: 30, priceCents: 9000, position: 0 },
    ]);
    const p = await getClientProfile(db, owner, c.id, { now: NOW });
    expect(p.historyTotal).toBe(7);
    expect(p.history).toHaveLength(5);
    expect(p.history[0]).toMatchObject({
      bookingId: ids[6],
      status: "canceled",
      services: ["Corte", "Barba"],
      professionalName: "Bia",
      totalCents: 5000,
    });
    expect(p.history.map((h) => h.bookingId)).toEqual([ids[6], ids[5], ids[4], ids[3], ids[2]]);
    const more = await getClientProfile(db, owner, c.id, { now: NOW, historyLimit: 20 });
    expect(more.history).toHaveLength(7);
  });

  it("traz email, notas e createdAt", async () => {
    const [c] = await db
      .insert(customers)
      .values({ tenantId: a.tenantId, name: "Ana", phone: "5511981234321", email: "ana@x.com", notes: "alérgica" })
      .returning();
    const p = await getClientProfile(db, owner, c.id, { now: NOW });
    expect(p).toMatchObject({ email: "ana@x.com", notes: "alérgica", visits: 0, totalCents: 0 });
    expect(p.createdAt).toBeInstanceOf(Date);
  });

  it("id inválido ou de outro estabelecimento -> not_found", async () => {
    const b = await seedBookable(db);
    const foreign = await addCustomer("De fora", "5511977770000", b.tenantId);
    for (const id of ["nao-e-uuid", foreign.id, "00000000-0000-0000-0000-000000000000"]) {
      await expect(getClientProfile(db, owner, id, { now: NOW })).rejects.toMatchObject({
        code: "not_found",
        message: "Cliente não encontrado.",
      });
    }
  });
});
