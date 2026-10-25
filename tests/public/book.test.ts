import { eq } from "drizzle-orm";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { bookings, customers, services } from "@/db/schema";
import type { Db } from "@/db/types";
import { findBookingByManageToken } from "@/server/agenda/bookings";
import { bookPublic } from "@/server/public/booking";
import { resetRateLimitsForTests } from "@/server/security/limits";
import { createTestDb } from "../helpers/test-db";
import { seedBookable, type PublicSeed } from "../helpers/public-fixtures";

const CONFLICT = "Esse horário acabou de ser reservado. Escolha outro.";
const NOW = new Date("2030-01-01T12:00:00.000Z");
const MONDAY_10 = new Date("2030-01-07T10:00:00.000-03:00");

let db: Db;
let seed: PublicSeed;

beforeEach(async () => {
  resetRateLimitsForTests();
  db = await createTestDb();
  seed = await seedBookable(db, { slug: "studio", pros: 2, tenant: { address: "Rua X, 120" } });
});
afterEach(() => vi.restoreAllMocks());

const valid = (over: Record<string, unknown> = {}) => ({
  serviceIds: [seed.serviceIds[0]],
  professionalId: "any",
  startsAt: MONDAY_10.toISOString(),
  name: "Paula Souza",
  phone: "(11) 98765-4321",
  email: "",
  consent: true,
  ...over,
});
const book = (over: Record<string, unknown> = {}, ip = "1.1.1.1", slug = "studio") =>
  bookPublic(db, slug, valid(over), { ip, now: NOW });

describe("bookPublic", () => {
  it("agenda pelo fluxo público e devolve o resumo com o token de gestão", async () => {
    const result = await book();
    expect(result.ok).toBe(true);
    if (!result.ok) return;

    expect(result.token).toMatch(/^[A-Za-z0-9_-]{43}$/);
    expect(result.booking).toMatchObject({
      status: "scheduled",
      date: "2030-01-07",
      time: "10:00",
      totalCents: 9000,
      durationMin: 30,
      services: [{ name: "Corte", durationMin: 30, priceCents: 9000 }],
    });
    // "Qualquer": um dos profissionais ativos.
    expect(["Bia", "Pro 2"]).toContain(result.booking.professionalName);

    const rows = await db.select().from(bookings).where(eq(bookings.tenantId, seed.tenantId));
    expect(rows).toHaveLength(1);
    expect(rows[0].source).toBe("public");
    expect(await findBookingByManageToken(db, result.token)).toEqual({
      tenantId: seed.tenantId,
      bookingId: rows[0].id,
    });
    const [customer] = await db.select().from(customers).where(eq(customers.tenantId, seed.tenantId));
    expect(customer).toMatchObject({ name: "Paula Souza", phone: "5511987654321", email: null });
  });

  it("guarda o e-mail (minúsculas) quando informado", async () => {
    const result = await book({ email: "  Paula@Exemplo.com " });
    expect(result.ok).toBe(true);
    const [customer] = await db.select().from(customers).where(eq(customers.tenantId, seed.tenantId));
    expect(customer.email).toBe("paula@exemplo.com");
  });

  it("sem consentimento: erro no campo e nada é gravado", async () => {
    for (const consent of [false, undefined, "true"]) {
      const result = await book({ consent });
      expect(result).toMatchObject({
        ok: false,
        code: "validation",
        fieldErrors: { consent: "Marque a caixa para concordar com o uso dos seus dados." },
      });
    }
    expect(await db.select().from(bookings)).toHaveLength(0);
    expect(await db.select().from(customers)).toHaveLength(0);
  });

  it("valida nome, WhatsApp e e-mail", async () => {
    expect(await book({ name: "A" })).toMatchObject({ ok: false, fieldErrors: { name: expect.any(String) } });
    expect(await book({ name: "x".repeat(81) })).toMatchObject({ ok: false, fieldErrors: { name: expect.any(String) } });
    expect(await book({ phone: "1".repeat(40) })).toMatchObject({ ok: false, fieldErrors: { phone: expect.any(String) } });
    expect(await book({ phone: "123" })).toMatchObject({
      ok: false,
      fieldErrors: { phone: "Informe um WhatsApp com DDD." },
    });
    expect(await book({ email: "isso-nao-e-email" })).toMatchObject({
      ok: false,
      fieldErrors: { email: expect.any(String) },
    });
    expect(await db.select().from(bookings)).toHaveLength(0);
  });

  it("entrada inválida não consome o limite de tentativas", async () => {
    for (let i = 0; i < 30; i++) await book({ consent: false });
    expect((await book()).ok).toBe(true);
  });

  it("horário já reservado: slot_taken com a mensagem exata", async () => {
    // Um só profissional: o segundo cliente não tem como.
    const solo = await seedBookable(db, { slug: "solo" });
    const input = { ...valid(), serviceIds: [solo.serviceIds[0]] };
    expect((await bookPublic(db, "solo", input, { ip: "1.1.1.1", now: NOW })).ok).toBe(true);
    const second = await bookPublic(
      db,
      "solo",
      { ...input, name: "Outra", phone: "(11) 91234-5678" },
      { ip: "2.2.2.2", now: NOW },
    );
    expect(second).toEqual({ ok: false, code: "slot_taken", error: CONFLICT });
  });

  it("sem nenhum serviço visível o salão fica indisponível", async () => {
    await db.update(services).set({ visible: false }).where(eq(services.id, seed.serviceIds[0]));
    expect(await book()).toMatchObject({ ok: false, code: "unavailable" });
    expect(await db.select().from(bookings)).toHaveLength(0);
  });

  it("serviço oculto com outro visível: invalid_selection", async () => {
    const two = await seedBookable(db, { slug: "dois", servicesCount: 2 });
    await db.update(services).set({ visible: false }).where(eq(services.id, two.serviceIds[1]));
    const result = await bookPublic(
      db,
      "dois",
      { ...valid(), serviceIds: [two.serviceIds[1]] },
      { ip: "1.1.1.1", now: NOW },
    );
    expect(result).toMatchObject({ ok: false, code: "invalid_selection" });
  });

  it("fora do expediente ou sem antecedência: slot_taken", async () => {
    const sunday = await book({ startsAt: new Date("2030-01-06T10:00:00.000-03:00").toISOString() });
    expect(sunday).toMatchObject({ ok: false, code: "slot_taken" });
    const tooSoon = await book({ startsAt: new Date("2030-01-01T09:30:00.000-03:00").toISOString() });
    expect(tooSoon).toMatchObject({ ok: false, code: "slot_taken" });
  });

  describe("estabelecimento indisponível", () => {
    it.each([
      ["e-mail não confirmado", { verified: false }],
      ["teste vencido", { trialEndsAt: new Date("2029-12-31T00:00:00.000Z") }],
      ["cancelado", { status: "canceled" as const }],
    ])("%s: não agenda", async (_label, options) => {
      const closed = await seedBookable(db, { slug: "fechado", ...options });
      const result = await bookPublic(
        db,
        "fechado",
        { ...valid(), serviceIds: [closed.serviceIds[0]] },
        { ip: "1.1.1.1", now: NOW },
      );
      expect(result).toEqual({
        ok: false,
        code: "unavailable",
        error: "Agendamento online indisponível no momento.",
      });
      expect(await db.select().from(bookings).where(eq(bookings.tenantId, closed.tenantId))).toHaveLength(0);
    });

    it("slug inexistente ou reservado", async () => {
      expect(await book({}, "1.1.1.1", "nao-existe")).toMatchObject({ ok: false, code: "unavailable" });
      expect(await book({}, "1.1.1.1", "painel")).toMatchObject({ ok: false, code: "unavailable" });
    });
  });

  describe("limite de tentativas", () => {
    it("10 por IP em 10 minutos", async () => {
      for (let i = 0; i < 10; i++) {
        // telefones diferentes: o limite por telefone não interfere
        const r = await book(
          {
            phone: `(11) 9${String(8000 + i)}-0000`,
            startsAt: new Date(`2030-01-07T${String(9 + i).padStart(2, "0")}:00:00.000-03:00`).toISOString(),
          },
          "9.9.9.9",
        );
        expect(r.ok || (r as { code: string }).code !== "rate_limited").toBe(true);
      }
      const blocked = await book({ phone: "(11) 97777-0000", startsAt: MONDAY_10.toISOString() }, "9.9.9.9");
      expect(blocked).toMatchObject({ ok: false, code: "rate_limited" });
      expect((blocked as { error: string }).error).toMatch(/^Muitas tentativas\. Tente de novo em \d+ minutos?\.$/);
      // outro IP segue normal
      expect(
        (await book({ phone: "(11) 97777-0000", startsAt: new Date("2030-01-07T17:00:00.000-03:00").toISOString() }, "8.8.8.8")).ok,
      ).toBe(true);
    });

    it("5 por telefone em 1 hora, de qualquer IP", async () => {
      for (let i = 0; i < 5; i++) {
        const r = await book({}, `7.7.7.${i}`);
        expect((r as { code?: string }).code).not.toBe("rate_limited");
      }
      const blocked = await book({}, "7.7.7.9");
      expect(blocked).toMatchObject({ ok: false, code: "rate_limited" });
    });
  });

  it("não devolve o nome guardado do cliente (nem de quem usa um telefone já cadastrado)", async () => {
    await book({ name: "Paula Souza" });
    await db.update(customers).set({ name: "Nome Secreto Cadastrado" }).where(eq(customers.tenantId, seed.tenantId));
    const second = await book({ name: "Intruso", startsAt: new Date("2030-01-07T11:00:00.000-03:00").toISOString() }, "3.3.3.3");
    expect(second.ok).toBe(true);
    expect(JSON.stringify(second)).not.toContain("Secreto");
    expect(JSON.stringify(second)).not.toContain("Cadastrado");
  });

  it("tentativa com horário passado ou salão indisponível não gasta a cota do telefone", async () => {
    const past = new Date("2029-12-31T10:00:00.000-03:00").toISOString();
    for (let i = 0; i < 10; i++) {
      expect(await book({ startsAt: past }, `5.5.5.${i}`)).toMatchObject({ ok: false, code: "slot_taken" });
    }
    for (let i = 0; i < 10; i++) {
      expect(await book({}, `6.6.6.${i}`, "nao-existe")).toMatchObject({ code: "unavailable" });
    }
    // A dona do telefone ainda consegue agendar (5 tentativas por hora seguem intactas).
    expect((await book({}, "4.4.4.4")).ok).toBe(true);
  });

  it("nunca escreve o token de gestão em log", async () => {
    const spies = (["log", "info", "warn", "error", "debug"] as const).map((m) =>
      vi.spyOn(console, m).mockImplementation(() => {}),
    );
    const result = await book();
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    for (const spy of spies) {
      expect(JSON.stringify(spy.mock.calls)).not.toContain(result.token);
    }
  });

  it("cliente já cadastrado: o agendamento público não troca o nome curado pela equipe", async () => {
    await book({ name: "Paula Souza" });
    await db.update(customers).set({ name: "Paula S. (VIP)" }).where(eq(customers.tenantId, seed.tenantId));
    const second = await book({ name: "Outro Nome", startsAt: new Date("2030-01-07T11:00:00.000-03:00").toISOString() }, "3.3.3.3");
    expect(second.ok).toBe(true);
    const [customer] = await db.select().from(customers).where(eq(customers.tenantId, seed.tenantId));
    expect(customer.name).toBe("Paula S. (VIP)");
  });

  it("o estabelecimento vem do slug, não de dados do cliente", async () => {
    const other = await seedBookable(db, { slug: "outro" });
    // serviço de OUTRO estabelecimento usando o slug do primeiro
    const result = await book({ serviceIds: [other.serviceIds[0]] });
    expect(result).toMatchObject({ ok: false, code: "invalid_selection" });
    expect(await db.select().from(bookings)).toHaveLength(0);
    expect(await db.select().from(bookings)).toHaveLength(0);
  });
});
