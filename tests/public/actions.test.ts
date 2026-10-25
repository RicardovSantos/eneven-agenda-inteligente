import { eq } from "drizzle-orm";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { bookings, services, tenants } from "@/db/schema";
import type { Db } from "@/db/types";
import { resetRateLimitsForTests } from "@/server/security/limits";
import { createTestDb } from "../helpers/test-db";
import { seedBookable, type PublicSeed } from "../helpers/public-fixtures";

const state = vi.hoisted(() => ({ db: undefined as unknown, ip: "1.1.1.1" }));
vi.mock("@/db/client", () => ({ getDb: async () => state.db }));
vi.mock("@/server/security/client-ip", () => ({ currentClientIp: async () => state.ip }));
vi.mock("next/cache", () => ({ revalidatePath: () => {} }));

import { bookAction, getDatesAction, getSlotsAction } from "@/app/[slug]/actions";
import {
  cancelAction,
  getRescheduleDatesAction,
  getRescheduleSlotsAction,
  rescheduleAction,
} from "@/app/agendamento/[token]/actions";

let db: Db;
let seed: PublicSeed;

beforeEach(async () => {
  resetRateLimitsForTests();
  db = await createTestDb();
  state.db = db;
  state.ip = "1.1.1.1";
  seed = await seedBookable(db, { slug: "studio", tenant: { maxDaysAhead: 60, minNoticeMin: 30 } });
});

const selection = () => ({ serviceIds: [seed.serviceIds[0]], professionalId: "any" });

/** Primeiro horário livre de verdade (hoje + alguns dias), sem depender da data de hoje. */
async function firstFreeSlot() {
  const dates = await getDatesAction("studio", { ...selection(), from: "2000-01-01" });
  if (!dates.ok) throw new Error(dates.error);
  expect(dates.dates.length).toBeGreaterThan(0);
  // Pula o dia de hoje (a antecedência pode cortar tudo) para ter um horário estável.
  const date = dates.dates[1] ?? dates.dates[0];
  const slots = await getSlotsAction("studio", { ...selection(), date });
  if (!slots.ok) throw new Error(slots.error);
  return slots.slots[0];
}

const customer = (over: Record<string, unknown> = {}) => ({
  name: "Paula Souza",
  phone: "(11) 98765-4321",
  email: "",
  consent: true,
  ...over,
});

describe("getSlotsAction e getDatesAction", () => {
  it("devolvem datas e horários do estabelecimento do slug", async () => {
    const slot = await firstFreeSlot();
    expect(slot.time).toMatch(/^\d{2}:\d{2}$/);
    expect(new Date(slot.startsAt).toString()).not.toBe("Invalid Date");
  });

  it("estabelecimento indisponível, slug inexistente ou entrada inválida: erro", async () => {
    const closed = await seedBookable(db, { slug: "fechado", verified: false });
    const unavailable = await getDatesAction("fechado", {
      serviceIds: [closed.serviceIds[0]],
      professionalId: "any",
      from: "2030-01-01",
    });
    expect(unavailable).toEqual({ ok: false, error: "Agendamento online indisponível no momento." });
    expect((await getDatesAction("nao-existe", { ...selection(), from: "2030-01-01" })).ok).toBe(false);
    expect((await getSlotsAction("studio", { serviceIds: [], professionalId: "any", date: "x" })).ok).toBe(false);
    expect((await getSlotsAction("studio", null)).ok).toBe(false);
  });

  it("serviço de outro estabelecimento: erro de seleção", async () => {
    const other = await seedBookable(db, { slug: "outro" });
    const result = await getSlotsAction("studio", {
      serviceIds: [other.serviceIds[0]],
      professionalId: "any",
      date: "2030-01-07",
    });
    expect(result).toEqual({ ok: false, error: "Serviço ou profissional indisponível." });
  });

  it("limita as consultas por IP", async () => {
    for (let i = 0; i < 120; i++) await getDatesAction("studio", { ...selection(), from: "2030-01-01" });
    const blocked = await getDatesAction("studio", { ...selection(), from: "2030-01-01" });
    expect(blocked).toMatchObject({ ok: false, error: expect.stringMatching(/^Muitas tentativas/) });
  }, 120_000);
});

describe("bookAction", () => {
  it("sem consentimento: erro e nada gravado", async () => {
    const slot = await firstFreeSlot();
    const result = await bookAction("studio", {
      ...selection(),
      startsAt: slot.startsAt,
      ...customer({ consent: false }),
    });
    expect(result).toMatchObject({ ok: false, code: "validation", fieldErrors: { consent: expect.any(String) } });
    expect(await db.select().from(bookings)).toHaveLength(0);
  });

  it("agenda e devolve o token; o IP vem do cabeçalho do servidor", async () => {
    const slot = await firstFreeSlot();
    const result = await bookAction("studio", { ...selection(), startsAt: slot.startsAt, ...customer() });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.booking.time).toBe(slot.time);
    expect(await db.select().from(bookings)).toHaveLength(1);
  });

  it("slot_taken aparece como resultado, não como exceção", async () => {
    const solo = await seedBookable(db, { slug: "solo", tenant: { maxDaysAhead: 60, minNoticeMin: 30 } });
    const dates = await getDatesAction("solo", {
      serviceIds: [solo.serviceIds[0]],
      professionalId: "any",
      from: "2000-01-01",
    });
    if (!dates.ok) throw new Error(dates.error);
    const slots = await getSlotsAction("solo", {
      serviceIds: [solo.serviceIds[0]],
      professionalId: "any",
      date: dates.dates[1],
    });
    if (!slots.ok) throw new Error(slots.error);
    const input = {
      serviceIds: [solo.serviceIds[0]],
      professionalId: "any",
      startsAt: slots.slots[0].startsAt,
    };
    expect((await bookAction("solo", { ...input, ...customer() })).ok).toBe(true);
    state.ip = "2.2.2.2";
    const second = await bookAction("solo", { ...input, ...customer({ name: "Outra", phone: "(11) 91234-5678" }) });
    expect(second).toEqual({
      ok: false,
      code: "slot_taken",
      error: "Esse horário acabou de ser reservado. Escolha outro.",
    });
  });

  it("serviço oculto durante o fluxo não passa", async () => {
    await seedBookable(db, { slug: "dois", servicesCount: 2 });
    const [second] = await db.select().from(services).where(eq(services.name, "Serviço 2"));
    await db.update(services).set({ visible: false }).where(eq(services.id, second.id));
    const slot = await firstFreeSlot();
    const result = await bookAction("dois", {
      serviceIds: [second.id],
      professionalId: "any",
      startsAt: slot.startsAt,
      ...customer(),
    });
    expect(result).toMatchObject({ ok: false, code: "invalid_selection" });
  });
});

describe("ações de gestão (token)", () => {
  async function newBooking() {
    const slot = await firstFreeSlot();
    const result = await bookAction("studio", { ...selection(), startsAt: slot.startsAt, ...customer() });
    if (!result.ok) throw new Error(result.error);
    return { token: result.token, slot };
  }

  it("token inválido: erro, sem vazar nada", async () => {
    expect(await cancelAction("token-inexistente")).toEqual({ ok: false, error: "Agendamento não encontrado." });
    expect(await rescheduleAction("token-inexistente", { startsAt: new Date().toISOString() })).toMatchObject({
      ok: false,
    });
    expect(await getRescheduleSlotsAction("token-inexistente", "2030-01-07")).toEqual({ ok: true, slots: [] });
    expect(await getRescheduleDatesAction("token-inexistente", "2030-01-07")).toEqual({ ok: true, dates: [] });
  });

  it("cancela pelo token", async () => {
    const { token } = await newBooking();
    expect(await cancelAction(token)).toEqual({ ok: true });
    const [row] = await db.select().from(bookings);
    expect(row.status).toBe("canceled");
  });

  it("fora da janela: mensagem com o nome do salão", async () => {
    const { token } = await newBooking();
    // Prazo de um ano: qualquer horário passa a estar fora da janela de mudança.
    await db.update(tenants).set({ cancelWindowMin: 60 * 24 * 365 });
    expect(await cancelAction(token)).toEqual({
      ok: false,
      error: "Para remarcar ou cancelar, fale com Studio Defendi.",
    });
    expect(await rescheduleAction(token, { startsAt: new Date(Date.now() + 5 * 86_400_000).toISOString() })).toEqual({
      ok: false,
      error: "Para remarcar ou cancelar, fale com Studio Defendi.",
    });
  });

  it("remarca escolhendo um horário da lista", async () => {
    const { token, slot } = await newBooking();
    const dates = await getRescheduleDatesAction(token, "2000-01-01");
    if (!dates.ok) throw new Error(dates.error);
    const date = dates.dates.at(-1)!;
    const slots = await getRescheduleSlotsAction(token, date);
    if (!slots.ok) throw new Error(slots.error);
    expect(slots.slots.length).toBeGreaterThan(0);
    expect(await rescheduleAction(token, { startsAt: slots.slots[0].startsAt })).toEqual({ ok: true });
    const [row] = await db.select().from(bookings);
    expect(row.startsAt.toISOString()).toBe(slots.slots[0].startsAt);
    expect(row.startsAt.toISOString()).not.toBe(slot.startsAt);
  });

  it("limita remarcar e cancelar por IP", async () => {
    for (let i = 0; i < 20; i++) await cancelAction("token-inexistente");
    expect(await cancelAction("token-inexistente")).toMatchObject({
      ok: false,
      error: expect.stringMatching(/^Muitas tentativas/),
    });
  });
});
