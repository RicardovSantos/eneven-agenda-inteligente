import { eq } from "drizzle-orm";
import { beforeEach, describe, expect, it } from "vitest";
import {
  bookingServices,
  bookings,
  businessHours,
  customers,
  professionalHours,
  professionalServices,
  professionals,
  pushEvents,
  services,
  tenants,
  timeBlocks,
} from "@/db/schema";
import type { Db } from "@/db/types";
import {
  BookingError,
  cancelBooking,
  createBooking,
  findBookingByManageToken,
  rescheduleBooking,
  setBookingStatus,
} from "@/server/agenda/bookings";
import { upsertCustomer } from "@/server/agenda/customers";
import { hashToken } from "@/server/auth/session";
import { withTenant } from "@/server/tenant-db";
import { seedProfessional, seedTenant } from "../helpers/agenda-fixtures";
import { createTestDb } from "../helpers/test-db";

const CONFLICT = "Esse horário acabou de ser reservado. Escolha outro.";
// America/Sao_Paulo = UTC-3 em 2030: 10:00 local = 13:00Z (segunda-feira).
const local = (hhmm: string) => new Date(`2030-01-07T${hhmm}:00.000-03:00`);
const NOW = new Date("2030-01-01T12:00:00.000Z");
const CUSTOMER = { name: "Ana", phone: "(11) 98765-4321" };

let db: Db;
let tenantId: string;
let proA: string;
let proB: string;
let serviceId: string;

async function addService(tid: string, durationMin = 30, over: Partial<typeof services.$inferInsert> = {}) {
  const [s] = await db
    .insert(services)
    .values({ tenantId: tid, name: "Corte", durationMin, priceCents: 5000, ...over })
    .returning();
  return s;
}

async function setupPro(tid: string, serviceIds: string[], name: string) {
  const pro = await seedProfessional(db, tid, name);
  await db
    .insert(professionalHours)
    .values({ tenantId: tid, professionalId: pro.id, weekday: 1, startsAt: "09:00", endsAt: "18:00" });
  for (const sid of serviceIds) {
    await db.insert(professionalServices).values({ tenantId: tid, professionalId: pro.id, serviceId: sid });
  }
  return pro;
}

beforeEach(async () => {
  db = await createTestDb();
  const t = await seedTenant(db, "loja-a");
  tenantId = t.id;
  await db.insert(businessHours).values({ tenantId, weekday: 1, startsAt: "09:00", endsAt: "18:00" });
  const s = await addService(tenantId);
  serviceId = s.id;
  proA = (await setupPro(tenantId, [serviceId], "Bia")).id;
  proB = (await setupPro(tenantId, [serviceId], "Cris")).id;
});

const book = (over: Partial<Parameters<typeof createBooking>[2]> = {}, now = NOW) =>
  createBooking(
    db,
    tenantId,
    {
      serviceIds: [serviceId],
      professionalId: proA,
      startsAt: local("10:00"),
      customer: CUSTOMER,
      source: "public",
      ...over,
    },
    now,
  );

const rejection = (p: Promise<unknown>) => p.then(() => null, (e: unknown) => e);

async function bookingRow(id: string) {
  const [row] = await withTenant(db, tenantId, (tx) => tx.select().from(bookings).where(eq(bookings.id, id)));
  return row;
}

describe("createBooking", () => {
  it("registra eventos de teste na mesma transação das alterações da agenda", async () => {
    const { bookingId } = await book();
    await rescheduleBooking(db, tenantId, bookingId, local("14:00"), "customer", NOW);
    await cancelBooking(db, tenantId, bookingId, "customer", NOW);
    const events = await db.select().from(pushEvents).where(eq(pushEvents.bookingId, bookingId));
    expect(events.map((event) => event.eventType).sort()).toEqual(["booking_canceled", "booking_created", "booking_rescheduled"]);
    expect(events.every((event) => event.tenantId === tenantId)).toBe(true);
  });
  it("cria agendamento público com snapshot dos serviços e token de gestão", async () => {
    const { bookingId, manageToken } = await book();
    const row = await bookingRow(bookingId);
    expect(row.status).toBe("scheduled");
    expect(row.source).toBe("public");
    expect(row.professionalId).toBe(proA);
    expect(row.startsAt).toEqual(local("10:00"));
    expect(row.endsAt).toEqual(local("10:30"));
    expect(row.totalCents).toBe(5000);
    expect(row.manageTokenHash).toBe(hashToken(manageToken));
    expect(row.manageTokenHash).not.toBe(manageToken);

    const lines = await withTenant(db, tenantId, (tx) => tx.select().from(bookingServices));
    expect(lines).toHaveLength(1);
    expect(lines[0]).toMatchObject({ name: "Corte", durationMin: 30, priceCents: 5000, position: 0 });

    expect(await findBookingByManageToken(db, manageToken)).toEqual({ tenantId, bookingId });
    expect(await findBookingByManageToken(db, "token-errado")).toBeNull();
  });

  it("soma duração e preço e usa o maior buffer de vários serviços", async () => {
    const s2 = await addService(tenantId, 45, { name: "Barba", priceCents: 3000, bufferAfterMin: 15 });
    await db.insert(professionalServices).values({ tenantId, professionalId: proA, serviceId: s2.id });
    const { bookingId } = await book({ serviceIds: [serviceId, s2.id] });
    const row = await bookingRow(bookingId);
    expect(row.endsAt).toEqual(local("11:15"));
    expect(row.blockedUntil).toEqual(local("11:30"));
    expect(row.totalCents).toBe(8000);
  });

  it("conflito no mesmo horário -> slot_taken com a mensagem de conflito", async () => {
    await book();
    const err = await rejection(book({ customer: { name: "Bia", phone: "11911112222" } }));
    expect(err).toBeInstanceOf(BookingError);
    expect((err as BookingError).code).toBe("slot_taken");
    expect((err as BookingError).message).toBe(CONFLICT);
  });

  it('"any" escolhe o profissional livre', async () => {
    await book({ professionalId: proA });
    const { bookingId } = await book({ professionalId: "any", customer: { name: "Bia", phone: "11911112222" } });
    expect((await bookingRow(bookingId)).professionalId).toBe(proB);
    const err = await rejection(book({ professionalId: "any", customer: { name: "Cy", phone: "11933334444" } }));
    expect((err as BookingError).code).toBe("slot_taken");
  });

  it('"any" prefere o profissional com menor carga no dia', async () => {
    await book({ professionalId: proA, startsAt: local("09:00") });
    const { bookingId } = await book({ professionalId: "any", startsAt: local("11:00") });
    expect((await bookingRow(bookingId)).professionalId).toBe(proB);
  });

  it("rejeita horário fora do expediente ou sem antecedência, exceto allowOutsideHours", async () => {
    const early = await rejection(book({ startsAt: local("07:00") }));
    expect((early as BookingError).code).toBe("slot_taken");
    const soon = await rejection(book({}, new Date(local("09:30"))));
    expect((soon as BookingError).code).toBe("slot_taken");

    const { bookingId } = await book({ startsAt: local("07:00"), source: "panel", allowOutsideHours: true });
    expect((await bookingRow(bookingId)).startsAt).toEqual(local("07:00"));
  });

  it("allowOutsideHours mantém a trava de sobreposição e os bloqueios", async () => {
    await book({ startsAt: local("07:00"), source: "panel", allowOutsideHours: true });
    const clash = await rejection(
      book({ startsAt: local("07:15"), source: "panel", allowOutsideHours: true, customer: { name: "B", phone: "11911112222" } }),
    );
    expect((clash as BookingError).code).toBe("slot_taken");

    await db.insert(timeBlocks).values({ tenantId, professionalId: proA, startsAt: local("12:00"), endsAt: local("13:00") });
    const blocked = await rejection(book({ startsAt: local("12:00"), source: "panel", allowOutsideHours: true }));
    expect((blocked as BookingError).code).toBe("slot_taken");
  });

  it("allowOutsideHours é ignorado em reservas públicas", async () => {
    const err = await rejection(book({ startsAt: local("07:00"), allowOutsideHours: true }));
    expect((err as BookingError).code).toBe("slot_taken");
  });

  it("serviço de outro tenant -> invalid_selection", async () => {
    const other = await seedTenant(db, "loja-b");
    const foreign = await addService(other.id);
    const err = await rejection(book({ serviceIds: [foreign.id] }));
    expect((err as BookingError).code).toBe("invalid_selection");
    const mixed = await rejection(book({ serviceIds: [serviceId, foreign.id] }));
    expect((mixed as BookingError).code).toBe("invalid_selection");
  });

  it("serviço arquivado, oculto (público) ou profissional inativo/sem o serviço -> invalid_selection", async () => {
    const archived = await addService(tenantId, 30, { archivedAt: new Date() });
    const hidden = await addService(tenantId, 30, { visible: false });
    for (const s of [archived, hidden]) {
      await db.insert(professionalServices).values({ tenantId, professionalId: proA, serviceId: s.id });
    }
    expect(((await rejection(book({ serviceIds: [archived.id] }))) as BookingError).code).toBe("invalid_selection");
    expect(((await rejection(book({ serviceIds: [hidden.id] }))) as BookingError).code).toBe("invalid_selection");
    // oculto no painel é permitido
    await book({ serviceIds: [hidden.id], source: "panel" });

    const lonely = await addService(tenantId);
    expect(((await rejection(book({ serviceIds: [lonely.id] }))) as BookingError).code).toBe("invalid_selection");

    await db.update(professionals).set({ active: false }).where(eq(professionals.id, proB));
    const inactive = await rejection(book({ professionalId: proB, startsAt: local("15:00") }));
    expect((inactive as BookingError).code).toBe("invalid_selection");
  });

  it("não aceita lista de serviços vazia", async () => {
    expect(((await rejection(book({ serviceIds: [] }))) as BookingError).code).toBe("invalid_selection");
  });

  it("cancelar libera o horário", async () => {
    const first = await book();
    await cancelBooking(db, tenantId, first.bookingId, "staff", NOW);
    await book({ customer: { name: "Bia", phone: "11911112222" } });
  });
});

describe("upsertCustomer", () => {
  it("telefones equivalentes dão o mesmo cliente; nome vazio não sobrescreve", async () => {
    const a = await withTenant(db, tenantId, (tx) =>
      upsertCustomer(tx, tenantId, { name: "Ana", phone: "+55 (11) 98765-4321" }),
    );
    const b = await withTenant(db, tenantId, (tx) =>
      upsertCustomer(tx, tenantId, { name: "", phone: "11987654321", email: "ana@x.com" }),
    );
    expect(b.id).toBe(a.id);
    const rows = await db.select().from(customers).where(eq(customers.tenantId, tenantId));
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ name: "Ana", phone: "5511987654321", email: "ana@x.com" });

    await withTenant(db, tenantId, (tx) => upsertCustomer(tx, tenantId, { name: "Ana Maria", phone: "11987654321" }));
    const [after] = await db.select().from(customers).where(eq(customers.id, a.id));
    expect(after).toMatchObject({ name: "Ana Maria", email: "ana@x.com" });
  });

  it("origem pública não sobrescreve dados preenchidos; painel sobrescreve", async () => {
    const up = (source: "public" | "panel", name: string, email?: string) =>
      withTenant(db, tenantId, (tx) =>
        upsertCustomer(tx, tenantId, { name, phone: "11987654321", email }, source),
      );
    const { id } = await up("panel", "Ana Curada", "curada@x.com");
    await up("public", "Outro Nome", "outro@x.com");
    let [row] = await db.select().from(customers).where(eq(customers.id, id));
    expect(row).toMatchObject({ name: "Ana Curada", email: "curada@x.com" });

    await db.update(customers).set({ email: null }).where(eq(customers.id, id));
    await up("public", "Outro Nome", "novo@x.com");
    [row] = await db.select().from(customers).where(eq(customers.id, id));
    expect(row).toMatchObject({ name: "Ana Curada", email: "novo@x.com" });

    await up("panel", "Ana Nova");
    [row] = await db.select().from(customers).where(eq(customers.id, id));
    expect(row.name).toBe("Ana Nova");
  });

  it("telefone inválido -> erro", async () => {
    const err = await rejection(withTenant(db, tenantId, (tx) => upsertCustomer(tx, tenantId, { name: "X", phone: "123" })));
    expect(err).toBeInstanceOf(BookingError);
  });

  it("createBooking reaproveita o cliente pelo telefone", async () => {
    const a = await book();
    const b = await book({ startsAt: local("11:00"), customer: { name: "", phone: "+55 (11) 98765-4321" } });
    expect((await bookingRow(a.bookingId)).customerId).toBe((await bookingRow(b.bookingId)).customerId);
  });
});

describe("cancelBooking / setBookingStatus", () => {
  it("cliente cancelando dentro da janela (60 min antes, janela 120) -> outside_window", async () => {
    const { bookingId } = await book();
    const err = await rejection(cancelBooking(db, tenantId, bookingId, "customer", new Date("2030-01-07T12:00:00.000Z")));
    expect(err).toBeInstanceOf(BookingError);
    expect((err as BookingError).code).toBe("outside_window");
    expect((await bookingRow(bookingId)).status).toBe("scheduled");
  });

  it("cliente cancela antes da janela; grava canceledAt e canceledBy", async () => {
    const { bookingId } = await book();
    const when = new Date("2030-01-07T10:00:00.000Z");
    await cancelBooking(db, tenantId, bookingId, "customer", when);
    const row = await bookingRow(bookingId);
    expect(row).toMatchObject({ status: "canceled", canceledBy: "customer" });
    expect(row.canceledAt).toEqual(when);
  });

  it("staff cancela mesmo dentro da janela; cancelar de novo -> invalid_transition", async () => {
    const { bookingId } = await book();
    await cancelBooking(db, tenantId, bookingId, "staff", new Date("2030-01-07T12:30:00.000Z"));
    expect((await bookingRow(bookingId)).canceledBy).toBe("staff");
    const err = await rejection(cancelBooking(db, tenantId, bookingId, "staff", NOW));
    expect((err as BookingError).code).toBe("invalid_transition");
  });

  it("transições de status", async () => {
    const { bookingId } = await book();
    await setBookingStatus(db, tenantId, bookingId, "confirmed");
    await setBookingStatus(db, tenantId, bookingId, "completed");
    await setBookingStatus(db, tenantId, bookingId, "scheduled");
    await setBookingStatus(db, tenantId, bookingId, "no_show");
    await setBookingStatus(db, tenantId, bookingId, "scheduled");
    expect((await bookingRow(bookingId)).status).toBe("scheduled");

    await setBookingStatus(db, tenantId, bookingId, "completed");
    const bad = await rejection(setBookingStatus(db, tenantId, bookingId, "confirmed"));
    expect((bad as BookingError).code).toBe("invalid_transition");
  });

  it("canceled -> confirmed é inválido", async () => {
    const { bookingId } = await book();
    await cancelBooking(db, tenantId, bookingId, "staff", NOW);
    const err = await rejection(setBookingStatus(db, tenantId, bookingId, "confirmed"));
    expect(err).toBeInstanceOf(BookingError);
    expect((err as BookingError).code).toBe("invalid_transition");
  });

  it("cancelar e confirmar ao mesmo tempo terminam em estado consistente", async () => {
    const { bookingId } = await book();
    const results = await Promise.allSettled([
      cancelBooking(db, tenantId, bookingId, "customer", new Date("2030-01-07T10:00:00.000Z")),
      setBookingStatus(db, tenantId, bookingId, "confirmed"),
    ]);
    const row = await bookingRow(bookingId);
    const failures = results.filter((r): r is PromiseRejectedResult => r.status === "rejected");
    for (const f of failures) expect((f.reason as BookingError).code).toBe("invalid_transition");
    // Nunca "confirmed" com canceledAt preenchido.
    if (row.status === "canceled") expect(row.canceledAt).not.toBeNull();
    else {
      expect(row.status).toBe("confirmed");
      expect(row.canceledAt).toBeNull();
    }
    expect(failures.length + results.filter((r) => r.status === "fulfilled").length).toBe(2);
  });

  it("agendamento inexistente ou de outro tenant -> not_found", async () => {
    const { bookingId } = await book();
    const other = await seedTenant(db, "loja-b");
    const a = await rejection(setBookingStatus(db, other.id, bookingId, "confirmed"));
    expect((a as BookingError).code).toBe("not_found");
    const b = await rejection(cancelBooking(db, tenantId, "00000000-0000-4000-8000-000000000000", "staff", NOW));
    expect((b as BookingError).code).toBe("not_found");
  });
});

describe("rescheduleBooking", () => {
  it("remarca mantendo profissional e duração", async () => {
    const { bookingId } = await book();
    await rescheduleBooking(db, tenantId, bookingId, local("14:00"), "customer", NOW);
    const row = await bookingRow(bookingId);
    expect(row.professionalId).toBe(proA);
    expect(row.startsAt).toEqual(local("14:00"));
    expect(row.endsAt).toEqual(local("14:30"));
    expect(row.blockedUntil).toEqual(local("14:30"));
  });

  it("pode remarcar para um horário que sobrepõe o próprio (ignora a si mesmo)", async () => {
    const { bookingId } = await book();
    await rescheduleBooking(db, tenantId, bookingId, local("10:15"), "customer", NOW);
    expect((await bookingRow(bookingId)).startsAt).toEqual(local("10:15"));
  });

  it("remarcar para horário ocupado -> slot_taken", async () => {
    await book();
    const { bookingId } = await book({ startsAt: local("14:00"), customer: { name: "Bia", phone: "11911112222" } });
    const err = await rejection(rescheduleBooking(db, tenantId, bookingId, local("10:00"), "customer", NOW));
    expect((err as BookingError).code).toBe("slot_taken");
    expect((err as BookingError).message).toBe(CONFLICT);
    expect((await bookingRow(bookingId)).startsAt).toEqual(local("14:00"));
  });

  it("cliente dentro da janela -> outside_window; staff pode", async () => {
    const { bookingId } = await book();
    const soon = new Date("2030-01-07T12:00:00.000Z");
    const err = await rejection(rescheduleBooking(db, tenantId, bookingId, local("15:00"), "customer", soon));
    expect((err as BookingError).code).toBe("outside_window");
    await rescheduleBooking(db, tenantId, bookingId, local("15:00"), "staff", soon);
    expect((await bookingRow(bookingId)).startsAt).toEqual(local("15:00"));
  });

  it("cliente: novo horário precisa estar no expediente", async () => {
    const { bookingId } = await book();
    const err = await rejection(rescheduleBooking(db, tenantId, bookingId, local("20:00"), "customer", NOW));
    expect((err as BookingError).code).toBe("slot_taken");
  });

  it("agendamento cancelado não remarca", async () => {
    const { bookingId } = await book();
    await cancelBooking(db, tenantId, bookingId, "staff", NOW);
    const err = await rejection(rescheduleBooking(db, tenantId, bookingId, local("15:00"), "staff", NOW));
    expect((err as BookingError).code).toBe("invalid_transition");
  });

  it("respeita cancelWindowMin do tenant", async () => {
    await db.update(tenants).set({ cancelWindowMin: 30 }).where(eq(tenants.id, tenantId));
    const { bookingId } = await book();
    await cancelBooking(db, tenantId, bookingId, "customer", new Date("2030-01-07T12:00:00.000Z"));
    expect((await bookingRow(bookingId)).status).toBe("canceled");
  });
});
