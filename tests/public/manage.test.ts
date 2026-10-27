import { eq } from "drizzle-orm";
import { beforeEach, describe, expect, it } from "vitest";
import { bookings, tenants, users } from "@/db/schema";
import type { Db } from "@/db/types";
import { bookPublic } from "@/server/public/booking";
import {
  cancelByToken,
  confirmByToken,
  getManageView,
  listRescheduleDates,
  listRescheduleSlots,
  rescheduleByToken,
} from "@/server/public/manage";
import { setBookingStatus } from "@/server/agenda/bookings";
import { resetRateLimitsForTests } from "@/server/security/limits";
import { createTestDb } from "../helpers/test-db";
import { seedBookable, type PublicSeed } from "../helpers/public-fixtures";

const OUTSIDE_WINDOW = "Fora do prazo para remarcar ou cancelar. Fale com o estabelecimento.";
const CONFLICT = "Esse horário acabou de ser reservado. Escolha outro.";
const NOW = new Date("2030-01-01T12:00:00.000Z");
const local = (date: string, hhmm: string) => new Date(`${date}T${hhmm}:00.000-03:00`);

let db: Db;
let seed: PublicSeed;
let token: string;
let bookingId: string;

async function book(startsAt: Date, over: Record<string, unknown> = {}, slug = "studio", svc = seed.serviceIds[0]) {
  const result = await bookPublic(
    db,
    slug,
    {
      serviceIds: [svc],
      professionalId: "any",
      startsAt: startsAt.toISOString(),
      name: "Paula",
      phone: "(11) 98765-4321",
      consent: true,
      ...over,
    },
    { ip: `10.0.0.${Math.floor(Math.random() * 250)}`, now: NOW },
  );
  if (!result.ok) throw new Error(`falha ao reservar: ${result.error}`);
  return result;
}

beforeEach(async () => {
  resetRateLimitsForTests();
  db = await createTestDb();
  seed = await seedBookable(db, { slug: "studio", tenant: { brandColor: "#0E7C86", address: "Rua X, 120" } });
  const result = await book(local("2030-01-07", "10:00"));
  token = result.token;
  bookingId = result.booking.bookingId;
});

describe("getManageView", () => {
  it("token inválido, vazio ou comprido demais: null", async () => {
    expect(await getManageView(db, "token-que-nao-existe", NOW)).toBeNull();
    expect(await getManageView(db, "", NOW)).toBeNull();
    expect(await getManageView(db, "x".repeat(500), NOW)).toBeNull();
  });

  it("mostra o agendamento, a marca do salão e permite mudar dentro da janela", async () => {
    const view = await getManageView(db, token, NOW);
    expect(view).not.toBeNull();
    expect(view!.tenant).toMatchObject({ slug: "studio", name: "Studio Defendi", brandColor: "#0E7C86", address: "Rua X, 120" });
    expect(view!.booking).toMatchObject({
      bookingId,
      status: "scheduled",
      date: "2030-01-07",
      time: "10:00",
    });
    expect(view!.canChange).toBe(true);
    expect(view!.canReschedule).toBe(true);
  });

  it("dentro do prazo mínimo (cancelWindowMin = 120): canChange falso", async () => {
    // 08:30 local = 90 min antes das 10:00
    const view = await getManageView(db, token, local("2030-01-07", "08:30"));
    expect(view!.canChange).toBe(false);
    // exatamente 120 min antes ainda pode
    expect((await getManageView(db, token, local("2030-01-07", "08:00")))!.canChange).toBe(true);
  });

  it("cancelado ou concluído: sem ações", async () => {
    await setBookingStatus(db, seed.tenantId, bookingId, "completed");
    expect((await getManageView(db, token, NOW))!.canChange).toBe(false);
    await setBookingStatus(db, seed.tenantId, bookingId, "scheduled");
    await cancelByToken(db, token, NOW);
    const view = await getManageView(db, token, NOW);
    expect(view!.booking.status).toBe("canceled");
    expect(view!.canChange).toBe(false);
  });
});

describe("salão que não pode agendar (e-mail não confirmado)", () => {
  beforeEach(async () => {
    await db.update(users).set({ emailVerifiedAt: null }).where(eq(users.id, seed.ownerId));
  });

  it("cancelar continua valendo; remarcar é recusado com orientação", async () => {
    const view = await getManageView(db, token, NOW);
    expect(view).toMatchObject({ canChange: true, canReschedule: false });
    await expect(
      rescheduleByToken(db, token, local("2030-01-08", "14:30").toISOString(), NOW),
    ).rejects.toMatchObject({ code: "reschedule_unavailable", message: "Para remarcar, fale com Studio Defendi." });
    expect(await listRescheduleSlots(db, token, "2030-01-08", NOW)).toEqual([]);
    expect(await listRescheduleDates(db, token, "2030-01-01", NOW)).toEqual([]);
    await cancelByToken(db, token, NOW);
    expect((await getManageView(db, token, NOW))!.booking.status).toBe("canceled");
  });
});

describe("cancelByToken", () => {
  it("cancela como cliente", async () => {
    await cancelByToken(db, token, NOW);
    const [row] = await db.select().from(bookings).where(eq(bookings.id, bookingId));
    expect(row.status).toBe("canceled");
    expect(row.canceledBy).toBe("customer");
  });

  it("fora da janela: recusa com a mensagem do prazo e mantém o agendamento", async () => {
    await expect(cancelByToken(db, token, local("2030-01-07", "09:00"))).rejects.toMatchObject({
      code: "outside_window",
      message: OUTSIDE_WINDOW,
    });
    const [row] = await db.select().from(bookings).where(eq(bookings.id, bookingId));
    expect(row.status).toBe("scheduled");
  });

  it("token inválido: not_found; já cancelado: invalid_transition", async () => {
    await expect(cancelByToken(db, "nada", NOW)).rejects.toMatchObject({ code: "not_found" });
    await cancelByToken(db, token, NOW);
    await expect(cancelByToken(db, token, NOW)).rejects.toMatchObject({ code: "invalid_transition" });
  });
});

describe("confirmByToken", () => {
  const statusOf = async () =>
    (await db.select().from(bookings).where(eq(bookings.id, bookingId)))[0].status;

  it("confirma um agendamento agendado e a página passa a mostrar confirmado", async () => {
    await confirmByToken(db, token, NOW);
    expect(await statusOf()).toBe("confirmed");
    const view = await getManageView(db, token, NOW);
    expect(view!.booking.status).toBe("confirmed");
    expect(view!.canConfirm).toBe(false);
  });

  it("getManageView: canConfirm só para agendado com horário futuro", async () => {
    expect((await getManageView(db, token, NOW))!.canConfirm).toBe(true);
    expect((await getManageView(db, token, local("2030-01-07", "10:30")))!.canConfirm).toBe(false);
  });

  it("já confirmado: sucesso idempotente, sem mudar nada", async () => {
    await setBookingStatus(db, seed.tenantId, bookingId, "confirmed");
    const [before] = await db.select().from(bookings).where(eq(bookings.id, bookingId));
    await expect(confirmByToken(db, token, NOW)).resolves.toBeUndefined();
    const [after] = await db.select().from(bookings).where(eq(bookings.id, bookingId));
    expect(after.status).toBe("confirmed");
    expect(after.updatedAt.getTime()).toBe(before.updatedAt.getTime());
  });

  it.each(["completed", "no_show"] as const)("recusa quando está %s", async (status) => {
    await setBookingStatus(db, seed.tenantId, bookingId, status);
    await expect(confirmByToken(db, token, NOW)).rejects.toMatchObject({ code: "invalid_transition" });
    expect(await statusOf()).toBe(status);
  });

  it("recusa quando está cancelado", async () => {
    await cancelByToken(db, token, NOW);
    await expect(confirmByToken(db, token, NOW)).rejects.toMatchObject({ code: "invalid_transition" });
    expect(await statusOf()).toBe("canceled");
  });

  it("recusa horário que já passou", async () => {
    await expect(confirmByToken(db, token, local("2030-01-07", "10:30"))).rejects.toMatchObject({
      code: "invalid_transition",
      message: "Esse horário já passou.",
    });
    expect(await statusOf()).toBe("scheduled");
  });

  it("token inválido: not_found", async () => {
    await expect(confirmByToken(db, "nada", NOW)).rejects.toMatchObject({ code: "not_found" });
  });

  it("não exige que o salão possa receber agendamentos (confirmar não cria horário)", async () => {
    await db.update(tenants).set({ status: "canceled" });
    await expect(confirmByToken(db, token, NOW)).resolves.toBeUndefined();
    expect(await statusOf()).toBe("confirmed");
  });
});

describe("remarcar pelo link", () => {
  it("lista horários do mesmo profissional, liberando o próprio horário", async () => {
    const slots = await listRescheduleSlots(db, token, "2030-01-07", NOW);
    expect(slots.map((s) => s.time)).toContain("10:00");
    expect(slots[0].time).toBe("09:00");
    expect(slots).toHaveLength(18);
  });

  it("lista as datas com horário", async () => {
    const dates = await listRescheduleDates(db, token, "2030-01-01", NOW);
    expect(dates[0]).toBe("2030-01-01");
    expect(dates).toContain("2030-01-07");
    expect(dates).not.toContain("2030-01-06");
  });

  it("remarca para um horário livre", async () => {
    await rescheduleByToken(db, token, local("2030-01-08", "14:30").toISOString(), NOW);
    const [row] = await db.select().from(bookings).where(eq(bookings.id, bookingId));
    expect(row.startsAt.toISOString()).toBe(local("2030-01-08", "14:30").toISOString());
    expect(row.status).toBe("scheduled");
    expect((await getManageView(db, token, NOW))!.booking).toMatchObject({ date: "2030-01-08", time: "14:30" });
  });

  it("horário tomado por outro: slot_taken com a mensagem exata", async () => {
    await book(local("2030-01-08", "14:30"), { name: "Outra", phone: "(11) 91234-5678" });
    await expect(
      rescheduleByToken(db, token, local("2030-01-08", "14:30").toISOString(), NOW),
    ).rejects.toMatchObject({ code: "slot_taken", message: CONFLICT });
  });

  it("fora do expediente: slot_taken; fora da janela do cliente: outside_window", async () => {
    await expect(
      rescheduleByToken(db, token, local("2030-01-06", "10:00").toISOString(), NOW),
    ).rejects.toMatchObject({ code: "slot_taken" });
    await expect(
      rescheduleByToken(db, token, local("2030-01-08", "10:00").toISOString(), local("2030-01-07", "09:00")),
    ).rejects.toMatchObject({ code: "outside_window", message: OUTSIDE_WINDOW });
    expect(await listRescheduleSlots(db, token, "2030-01-08", local("2030-01-07", "09:00"))).toEqual([]);
  });

  it("cancelado: sem horários e recusa remarcar", async () => {
    await cancelByToken(db, token, NOW);
    expect(await listRescheduleSlots(db, token, "2030-01-08", NOW)).toEqual([]);
    expect(await listRescheduleDates(db, token, "2030-01-01", NOW)).toEqual([]);
    await expect(
      rescheduleByToken(db, token, local("2030-01-08", "10:00").toISOString(), NOW),
    ).rejects.toMatchObject({ code: "invalid_transition" });
  });

  it("token inválido: not_found e lista vazia", async () => {
    await expect(
      rescheduleByToken(db, "nada", local("2030-01-08", "10:00").toISOString(), NOW),
    ).rejects.toMatchObject({ code: "not_found" });
    expect(await listRescheduleSlots(db, "nada", "2030-01-08", NOW)).toEqual([]);
  });
});
