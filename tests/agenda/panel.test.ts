import { eq } from "drizzle-orm";
import { beforeEach, describe, expect, it } from "vitest";
import { customers, memberships, professionals, timeBlocks, users } from "@/db/schema";
import type { Db } from "@/db/types";
import { BookingError, createBooking, findBookingByManageToken } from "@/server/agenda/bookings";
import {
  cancelBookingAsStaff,
  completeBooking,
  confirmBooking,
  createBlock,
  createPanelBooking,
  deleteBlock,
  issueManageLink,
  noShowBooking,
  rescheduleBookingAsStaff,
  searchCustomers,
  undoBookingStatus,
  type PanelActor,
} from "@/server/agenda/panel-ops";
import { findStaffProfessional, getDayAgenda, getMonthAgenda, getMonthOverview } from "@/server/agenda/panel-queries";
import { withTenant } from "@/server/tenant-db";
import { createTestDb } from "../helpers/test-db";
import { seedBookable, type PublicSeed } from "../helpers/public-fixtures";

// America/Sao_Paulo = UTC-3 em 2030. 2030-01-07 é segunda; 2030-01-06 é domingo.
const local = (date: string, hhmm: string) => new Date(`${date}T${hhmm}:00.000-03:00`);
const NOW = new Date("2030-01-01T12:00:00.000Z");

let db: Db;
let a: PublicSeed;
let owner: PanelActor;

const actorOf = (seed: PublicSeed, role: PanelActor["role"] = "owner", userId = seed.ownerId): PanelActor => ({
  tenantId: seed.tenantId,
  userId,
  role,
});

async function book(
  seed: PublicSeed,
  date: string,
  hhmm: string,
  opts: { pro?: number; name?: string; phone?: string } = {},
) {
  const { bookingId } = await createBooking(
    db,
    seed.tenantId,
    {
      serviceIds: [seed.serviceIds[0]],
      professionalId: seed.proIds[opts.pro ?? 0],
      startsAt: local(date, hhmm),
      customer: { name: opts.name ?? "Ana Souza", phone: opts.phone ?? "(11) 98765-4321" },
      source: "panel",
    },
    NOW,
  );
  return bookingId;
}

beforeEach(async () => {
  db = await createTestDb();
  a = await seedBookable(db, { pros: 2 });
  owner = actorOf(a);
});

describe("getMonthOverview", () => {
  it("calcula ocupação (minutos agendados ÷ expediente), contagem e dias fechados", async () => {
    await book(a, "2030-01-07", "10:00"); // 30 min
    await book(a, "2030-01-07", "11:00", { name: "Carla" }); // 30 min
    const canceled = await book(a, "2030-01-07", "15:00", { name: "Bia" });
    await cancelBookingAsStaff(db, owner, canceled, NOW);

    const days = await getMonthOverview(db, a.tenantId, "2030-01");
    expect(days).toHaveLength(31);
    const monday = days.find((d) => d.date === "2030-01-07")!;
    expect(monday.count).toBe(2);
    expect(monday.closed).toBe(false);
    // 60 min agendados ÷ 540 min (09:00–18:00; os dois profissionais têm o mesmo horário).
    expect(monday.occupancy).toBeCloseTo(60 / 540, 5);
    const sunday = days.find((d) => d.date === "2030-01-06")!;
    expect(sunday).toEqual({ date: "2030-01-06", count: 0, occupancy: 0, closed: true });
    expect(days.find((d) => d.date === "2030-01-08")!.occupancy).toBe(0);
  });

  it("filtra por profissional e limita a ocupação a 1", async () => {
    for (let h = 9; h < 18; h++) {
      const hh = String(h).padStart(2, "0");
      await book(a, "2030-01-08", `${hh}:00`, { pro: 1, phone: `(11) 9${8000 + h}-0000` });
      await book(a, "2030-01-08", `${hh}:30`, { pro: 1, phone: `(11) 9${7000 + h}-0000` });
    }
    const forPro1 = (await getMonthOverview(db, a.tenantId, "2030-01", a.proIds[1])).find(
      (d) => d.date === "2030-01-08",
    )!;
    expect(forPro1.count).toBe(18);
    expect(forPro1.occupancy).toBe(1);
    const forPro0 = (await getMonthOverview(db, a.tenantId, "2030-01", a.proIds[0])).find(
      (d) => d.date === "2030-01-08",
    )!;
    expect(forPro0.count).toBe(0);
  });
});

describe("getMonthAgenda", () => {
  it("traz do dia escolhido até o fim do mês, em ordem, com o filtro de profissional, e deixa de fora outros meses", async () => {
    await book(a, "2030-01-14", "10:00", { name: "Carla", phone: "(11) 92222-2222" });
    await book(a, "2030-01-07", "09:00", { name: "Ana" });
    await book(a, "2030-01-21", "09:00", { name: "Bia", pro: 1, phone: "(11) 93333-3333" });
    await book(a, "2030-02-04", "09:00", { name: "Fora", phone: "(11) 94444-4444" });

    const all = await getMonthAgenda(db, a.tenantId, "2030-01-01");
    expect(all.items.map((i) => (i.kind === "booking" ? i.customer.name : "bloqueio"))).toEqual(["Ana", "Carla", "Bia"]);
    expect(all.count).toBe(3);

    const only = await getMonthAgenda(db, a.tenantId, "2030-01-01", a.proIds[1]);
    expect(only.items.map((i) => (i.kind === "booking" ? i.customer.name : "bloqueio"))).toEqual(["Bia"]);

    const fromTenth = await getMonthAgenda(db, a.tenantId, "2030-01-10");
    expect(fromTenth.items.map((i) => (i.kind === "booking" ? i.customer.name : "bloqueio"))).toEqual(["Carla", "Bia"]);
  });
});

describe("getDayAgenda", () => {
  it("ordena agendamentos e bloqueios, soma só os não cancelados e traz as visitas", async () => {
    const late = await book(a, "2030-01-07", "15:00", { name: "Paula" });
    await book(a, "2030-01-07", "09:00", { name: "Ana", phone: "(11) 91111-1111" });
    const canceled = await book(a, "2030-01-07", "12:00", { name: "Carla", phone: "(11) 92222-2222" });
    await cancelBookingAsStaff(db, owner, canceled, NOW);
    await createBlock(db, owner, {
      professionalId: null,
      startsAt: local("2030-01-07", "13:00").toISOString(),
      endsAt: local("2030-01-07", "14:00").toISOString(),
      reason: "Almoço",
    });
    await book(a, "2030-01-14", "10:00", { name: "Paula" }); // outra segunda: 2ª visita de Paula

    const day = await getDayAgenda(db, a.tenantId, "2030-01-07");
    expect(
      day.items.map((i) => (i.kind === "block" ? `bloqueio ${i.time}` : `${i.time} ${i.customer.name}`)),
    ).toEqual(["09:00 Ana", "12:00 Carla", "bloqueio 13:00", "15:00 Paula"]);
    expect(day.count).toBe(2);
    expect(day.totalCents).toBe(18_000);
    const paula = day.items.find((i) => i.kind === "booking" && i.id === late);
    expect(paula).toMatchObject({
      kind: "booking",
      status: "scheduled",
      time: "15:00",
      endTime: "15:30",
      totalCents: 9000,
      professional: { name: "Bia" },
      services: [{ name: "Corte", durationMin: 30, priceCents: 9000 }],
      customer: { name: "Paula", visits: 1 },
    });
    const block = day.items.find((i) => i.kind === "block");
    expect(block).toMatchObject({ reason: "Almoço", professionalId: null, time: "13:00", endTime: "14:00" });
  });

  it("com filtro de profissional mostra só os dele e os bloqueios gerais ou dele", async () => {
    await book(a, "2030-01-07", "09:00", { pro: 0, name: "Ana" });
    await book(a, "2030-01-07", "10:00", { pro: 1, name: "Léo Cliente", phone: "(11) 93333-3333" });
    await createBlock(db, owner, {
      professionalId: a.proIds[0],
      startsAt: local("2030-01-07", "16:00").toISOString(),
      endsAt: local("2030-01-07", "17:00").toISOString(),
      reason: "Dentista",
    });
    const day = await getDayAgenda(db, a.tenantId, "2030-01-07", a.proIds[1]);
    expect(day.items).toHaveLength(1);
    expect(day.items[0]).toMatchObject({ kind: "booking", customer: { name: "Léo Cliente" } });
  });
});

describe("ações do painel", () => {
  it("confirma, conclui, marca falta, desfaz e cancela", async () => {
    const id = await book(a, "2030-01-07", "10:00");
    const status = async () =>
      (await getDayAgenda(db, a.tenantId, "2030-01-07")).items.find((i) => i.kind === "booking" && i.id === id)!;
    await confirmBooking(db, owner, id);
    expect(await status()).toMatchObject({ status: "confirmed" });
    await completeBooking(db, owner, id);
    expect(await status()).toMatchObject({ status: "completed" });
    await undoBookingStatus(db, owner, id);
    expect(await status()).toMatchObject({ status: "scheduled" });
    await noShowBooking(db, owner, id);
    expect(await status()).toMatchObject({ status: "no_show" });
    await undoBookingStatus(db, owner, id);
    const cancel = await cancelBookingAsStaff(db, owner, id, NOW);
    expect(await status()).toMatchObject({ status: "canceled" });
    await expect(confirmBooking(db, owner, id)).rejects.toMatchObject({ code: "invalid_transition" });
    expect(cancel.whatsappUrl).toBe(
      "https://wa.me/5511987654321?text=" +
        encodeURIComponent(
          "Olá, Ana! Seu horário de Corte no Studio Defendi em segunda, 7 de janeiro às 10:00 foi cancelado.",
        ),
    );
  });

  it("remarcar devolve o texto do WhatsApp com o novo horário e respeita conflitos", async () => {
    const id = await book(a, "2030-01-07", "10:00");
    await book(a, "2030-01-08", "11:00", { name: "Outra", phone: "(11) 94444-4444" });
    const result = await rescheduleBookingAsStaff(
      db,
      owner,
      id,
      local("2030-01-08", "14:30").toISOString(),
      undefined,
      NOW,
    );
    expect(decodeURIComponent(result.whatsappUrl.split("?text=")[1])).toBe(
      "Olá, Ana! Seu horário de Corte no Studio Defendi foi remarcado para terça, 8 de janeiro às 14:30.",
    );
    await expect(
      rescheduleBookingAsStaff(db, owner, id, local("2030-01-08", "11:00").toISOString(), undefined, NOW),
    ).rejects.toMatchObject({ code: "slot_taken" });
  });

  it("id de agendamento de outro estabelecimento ou inválido: não encontrado", async () => {
    const b = await seedBookable(db, { pros: 1 });
    const foreign = await book(b, "2030-01-07", "10:00");
    for (const fn of [confirmBooking, completeBooking, noShowBooking, undoBookingStatus]) {
      await expect(fn(db, owner, foreign)).rejects.toMatchObject({
        code: "not_found",
        message: "Agendamento não encontrado.",
      });
      await expect(fn(db, owner, "não-é-uuid")).rejects.toBeInstanceOf(BookingError);
    }
    await expect(cancelBookingAsStaff(db, owner, foreign, NOW)).rejects.toMatchObject({ code: "not_found" });
    await expect(
      rescheduleBookingAsStaff(db, owner, foreign, local("2030-01-08", "10:00").toISOString(), undefined, NOW),
    ).rejects.toMatchObject({ code: "not_found" });
    await expect(issueManageLink(db, owner, foreign, NOW)).rejects.toMatchObject({ code: "not_found" });
    // E nada mudou no outro estabelecimento.
    expect((await getDayAgenda(db, b.tenantId, "2030-01-07")).items[0]).toMatchObject({ status: "scheduled" });
  });

  describe("profissional (staff)", () => {
    let staff: PanelActor;
    beforeEach(async () => {
      const [user] = await db
        .insert(users)
        .values({ email: "leo@exemplo.com", name: "Léo", emailVerifiedAt: new Date() })
        .returning();
      await db.insert(memberships).values({ userId: user.id, tenantId: a.tenantId, role: "staff" });
      await db.update(professionals).set({ userId: user.id }).where(eq(professionals.id, a.proIds[1]));
      staff = actorOf(a, "staff", user.id);
    });

    it("não age em agendamento de outro profissional, mas age no próprio", async () => {
      const others = await book(a, "2030-01-07", "10:00", { pro: 0 });
      const mine = await book(a, "2030-01-07", "11:00", { pro: 1, name: "Minha", phone: "(11) 95555-5555" });
      for (const fn of [confirmBooking, completeBooking, noShowBooking, undoBookingStatus]) {
        await expect(fn(db, staff, others)).rejects.toMatchObject({ code: "not_found" });
      }
      await expect(cancelBookingAsStaff(db, staff, others, NOW)).rejects.toMatchObject({ code: "not_found" });
      await expect(
        rescheduleBookingAsStaff(db, staff, others, local("2030-01-08", "10:00").toISOString(), undefined, NOW),
      ).rejects.toMatchObject({ code: "not_found" });
      await expect(issueManageLink(db, staff, others, NOW)).rejects.toMatchObject({ code: "not_found" });
      await confirmBooking(db, staff, mine);
      const all = await getDayAgenda(db, a.tenantId, "2030-01-07");
      expect(all.items.find((i) => i.kind === "booking" && i.id === others)).toMatchObject({ status: "scheduled" });
      expect(all.items.find((i) => i.kind === "booking" && i.id === mine)).toMatchObject({ status: "confirmed" });
    });

    it("cria agendamento e bloqueio sempre no próprio profissional e só apaga bloqueio dele", async () => {
      const { bookingId } = await createPanelBooking(
        db,
        staff,
        {
          serviceIds: [a.serviceIds[0]],
          professionalId: a.proIds[0], // tentativa de agendar no colega
          startsAt: local("2030-01-07", "10:00").toISOString(),
          name: "Nova",
          phone: "(11) 96666-6666",
        },
        NOW,
      );
      const day = await getDayAgenda(db, a.tenantId, "2030-01-07");
      expect(day.items.find((i) => i.kind === "booking" && i.id === bookingId)).toMatchObject({
        professional: { id: a.proIds[1] },
      });

      const { id: blockId } = await createBlock(db, staff, {
        professionalId: null,
        startsAt: local("2030-01-07", "16:00").toISOString(),
        endsAt: local("2030-01-07", "17:00").toISOString(),
        reason: "Folga",
      });
      const [row] = await withTenant(db, a.tenantId, (tx) =>
        tx.select().from(timeBlocks).where(eq(timeBlocks.id, blockId)),
      );
      expect(row.professionalId).toBe(a.proIds[1]);

      const { id: foreignBlock } = await createBlock(db, owner, {
        professionalId: a.proIds[0],
        startsAt: local("2030-01-07", "12:00").toISOString(),
        endsAt: local("2030-01-07", "13:00").toISOString(),
        reason: null,
      });
      await expect(deleteBlock(db, staff, foreignBlock)).rejects.toMatchObject({ code: "not_found" });
      await deleteBlock(db, staff, blockId);
      await deleteBlock(db, owner, foreignBlock);
    });

    it("busca só clientes que já passaram por ele", async () => {
      await book(a, "2030-01-07", "10:00", { pro: 0, name: "Ana Souza", phone: "(11) 91111-1111" });
      await book(a, "2030-01-07", "11:00", { pro: 1, name: "Ana Lima", phone: "(11) 92222-2222" });
      expect((await searchCustomers(db, owner, "ana")).map((c) => c.name).sort()).toEqual(["Ana Lima", "Ana Souza"]);
      expect((await searchCustomers(db, staff, "ana")).map((c) => c.name)).toEqual(["Ana Lima"]);
    });
  });

  it("cria agendamento pelo painel fora do expediente e conflito continua valendo", async () => {
    const input = {
      serviceIds: [a.serviceIds[0]],
      professionalId: a.proIds[0],
      startsAt: local("2030-01-07", "20:00").toISOString(),
      name: "Encaixe",
      phone: "(11) 97777-7777",
    };
    await expect(createPanelBooking(db, owner, input, NOW)).rejects.toMatchObject({ code: "slot_taken" });
    const { bookingId } = await createPanelBooking(db, owner, { ...input, allowOutsideHours: true }, NOW);
    expect(bookingId).toBeTruthy();
    await expect(createPanelBooking(db, owner, { ...input, allowOutsideHours: true }, NOW)).rejects.toMatchObject({
      code: "slot_taken",
    });
  });

  it("busca clientes por nome ou telefone (até 8) e ignora termos curtos", async () => {
    for (let i = 0; i < 10; i++) {
      await createBooking(
        db,
        a.tenantId,
        {
          serviceIds: [a.serviceIds[0]],
          professionalId: a.proIds[i % 2],
          startsAt: local("2030-01-07", `${String(9 + Math.floor(i / 2)).padStart(2, "0")}:00`),
          customer: { name: `Marina ${i}`, phone: `(11) 9${1000 + i}-0000` },
          source: "panel",
        },
        NOW,
      );
    }
    expect(await searchCustomers(db, owner, "mar")).toHaveLength(8);
    expect(await searchCustomers(db, owner, "Marina 3")).toHaveLength(1);
    expect(await searchCustomers(db, owner, "(11) 91005")).toEqual([
      expect.objectContaining({ name: "Marina 5", phone: "5511910050000" }),
    ]);
    expect(await searchCustomers(db, owner, "m")).toEqual([]);
    expect(await searchCustomers(db, owner, "%")).toEqual([]);
  });

  it("bloqueio: valida o intervalo e o profissional do próprio estabelecimento", async () => {
    await expect(
      createBlock(db, owner, {
        professionalId: null,
        startsAt: local("2030-01-07", "12:00").toISOString(),
        endsAt: local("2030-01-07", "11:00").toISOString(),
        reason: null,
      }),
    ).rejects.toBeInstanceOf(BookingError);
    const b = await seedBookable(db, { pros: 1 });
    await expect(
      createBlock(db, owner, {
        professionalId: b.proIds[0],
        startsAt: local("2030-01-07", "11:00").toISOString(),
        endsAt: local("2030-01-07", "12:00").toISOString(),
        reason: null,
      }),
    ).rejects.toBeInstanceOf(BookingError);
  });

  it("link de gestão do lembrete troca o token (o antigo deixa de valer)", async () => {
    const { bookingId, manageToken } = await createBooking(
      db,
      a.tenantId,
      {
        serviceIds: [a.serviceIds[0]],
        professionalId: a.proIds[0],
        startsAt: local("2030-01-07", "10:00"),
        customer: { name: "Ana Souza", phone: "(11) 98765-4321" },
        source: "panel",
      },
      NOW,
    );
    const { whatsappUrl } = await issueManageLink(db, owner, bookingId, NOW);
    const text = decodeURIComponent(whatsappUrl.split("?text=")[1]);
    const link = /Para confirmar ou remarcar: (\S+)$/.exec(text)![1];
    expect(
      text.startsWith("Olá, Ana! Lembrando do seu horário de Corte no Studio Defendi segunda, 7 de janeiro às 10:00."),
    ).toBe(true);
    const token = link.split("/agendamento/")[1];
    expect(await findBookingByManageToken(db, manageToken)).toBeNull();
    expect(await findBookingByManageToken(db, token)).toEqual({ tenantId: a.tenantId, bookingId });
  });

  describe("regras do painel x página pública", () => {
    const input = (startsAt: Date) => ({
      serviceIds: [a.serviceIds[0]],
      professionalId: a.proIds[0],
      startsAt,
      customer: { name: "Ana", phone: "(11) 98765-4321" },
    });

    it("painel agenda 30 min à frente (antecedência 60) e além do prazo máximo; público continua barrando", async () => {
      const now = local("2030-01-07", "10:00");
      const soon = local("2030-01-07", "10:30");
      await expect(createBooking(db, a.tenantId, { ...input(soon), source: "public" }, now)).rejects.toMatchObject({
        code: "slot_taken",
      });
      await expect(createBooking(db, a.tenantId, { ...input(soon), source: "panel" }, now)).resolves.toBeTruthy();

      const far = local("2030-03-04", "10:00"); // segunda, muito além de 30 dias
      await expect(createBooking(db, a.tenantId, { ...input(far), source: "public" }, now)).rejects.toMatchObject({
        code: "slot_taken",
      });
      await expect(createBooking(db, a.tenantId, { ...input(far), source: "panel" }, now)).resolves.toBeTruthy();
      // Conflito continua valendo no painel.
      await expect(createBooking(db, a.tenantId, { ...input(far), source: "panel" }, now)).rejects.toMatchObject({
        code: "slot_taken",
      });
    });
  });

  it("staff não sobrescreve nome/e-mail de cliente existente; recepção e proprietário sim", async () => {
    const [user] = await db
      .insert(users)
      .values({ email: "leo2@exemplo.com", name: "Léo", emailVerifiedAt: new Date() })
      .returning();
    await db.insert(memberships).values({ userId: user.id, tenantId: a.tenantId, role: "staff" });
    await db.update(professionals).set({ userId: user.id }).where(eq(professionals.id, a.proIds[1]));
    const staff = actorOf(a, "staff", user.id);
    const base = {
      serviceIds: [a.serviceIds[0]],
      professionalId: "any" as const,
      phone: "(11) 98765-4321",
    };
    await createPanelBooking(db, owner, { ...base, startsAt: local("2030-01-08", "10:00").toISOString(), name: "Ana Souza", email: "ana@exemplo.com" }, NOW);
    await createPanelBooking(db, staff, { ...base, startsAt: local("2030-01-08", "11:00").toISOString(), name: "Outro Nome", email: "outro@exemplo.com" }, NOW);
    expect((await searchCustomers(db, owner, "98765"))[0].name).toBe("Ana Souza");
    const [kept] = await withTenant(db, a.tenantId, (tx) => tx.select().from(customers));
    expect(kept.email).toBe("ana@exemplo.com");

    await createPanelBooking(db, actorOf(a, "reception"), { ...base, startsAt: local("2030-01-08", "12:00").toISOString(), name: "Ana Souza Lima" }, NOW);
    expect((await searchCustomers(db, owner, "98765"))[0].name).toBe("Ana Souza Lima");
  });

  it("e-mail inválido no agendamento do painel", async () => {
    await expect(
      createPanelBooking(
        db,
        owner,
        {
          serviceIds: [a.serviceIds[0]],
          professionalId: a.proIds[0],
          startsAt: local("2030-01-08", "10:00").toISOString(),
          name: "Ana",
          phone: "(11) 98765-4321",
          email: "isso-nao-e-email",
        },
        NOW,
      ),
    ).rejects.toMatchObject({ code: "invalid_selection" });
  });

  it("profissional inativo ligado ao usuário não vê nada (mesmo resolvedor da página)", async () => {
    const [user] = await db
      .insert(users)
      .values({ email: "inativo@exemplo.com", name: "Inativo", emailVerifiedAt: new Date() })
      .returning();
    await db.insert(memberships).values({ userId: user.id, tenantId: a.tenantId, role: "staff" });
    const id = await book(a, "2030-01-07", "10:00", { pro: 1 });
    await db.update(professionals).set({ userId: user.id, active: false }).where(eq(professionals.id, a.proIds[1]));
    await expect(confirmBooking(db, actorOf(a, "staff", user.id), id)).rejects.toMatchObject({ code: "not_found" });
    expect(await findStaffProfessional(db, a.tenantId, user.id)).toBeNull();
  });
});
