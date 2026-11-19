import { eq } from "drizzle-orm";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { bookings, googleCalendarConnections, googleCalendarEvents, memberships, professionals, users } from "@/db/schema";
import type { Db } from "@/db/types";
import { googleCalendarEnabled } from "@/server/calendar/config";
import { connectionEligibility, disconnect, revokeConnections, saveConnection, setConnectionEnabled } from "@/server/calendar/connections";
import { buildCalendarEvent, googleEventId } from "@/server/calendar/event-builder";
import { openSecret, sealSecret } from "@/server/calendar/secret";
import { backoffMs, runCalendarCycle } from "@/server/calendar/sync";
import { at, bookingValues, seedBooking, seedCustomer, seedProfessional } from "../helpers/agenda-fixtures";
import { seedOwnerTenant } from "../helpers/team-fixtures";
import { createTestDb } from "../helpers/test-db";

type Call = { method: string; url: string; body: unknown };

/** Google simulado: guarda as chamadas e responde conforme o cenário. */
function fakeGoogle(scenario: { token?: "ok" | "invalid_grant"; events?: "ok" | "rate" | "calendar_gone" } = {}) {
  const calls: Call[] = [];
  const known = new Set<string>();
  const fetcher = vi.fn<typeof fetch>(async (input, init) => {
    const url = String(input);
    const method = init?.method ?? "GET";
    let body: unknown = init?.body;
    if (typeof body === "string") { try { body = JSON.parse(body); } catch { /* formulário */ } } else if (body instanceof URLSearchParams) body = Object.fromEntries(body);
    calls.push({ method, url, body });
    if (url.includes("oauth2.googleapis.com/token")) return scenario.token === "invalid_grant" ? Response.json({ error: "invalid_grant" }, { status: 400 }) : Response.json({ access_token: "at", expires_in: 3600 });
    if (url.includes("oauth2.googleapis.com/revoke")) return new Response(null, { status: 200 });
    if (url.endsWith("/calendars") && method === "POST") return Response.json({ id: "cal-novo" });
    if (url.includes("/events")) {
      if (scenario.events === "rate") return Response.json({ error: { errors: [{ reason: "rateLimitExceeded" }] } }, { status: 403 });
      if (scenario.events === "calendar_gone" && method === "POST") return Response.json({ error: { errors: [{ reason: "notFound" }] } }, { status: 404 });
      const id = (body as { id?: string } | undefined)?.id;
      if (method === "POST") { if (id && known.has(id)) return Response.json({ error: { errors: [{ reason: "duplicate" }] } }, { status: 409 }); if (id) known.add(id); return Response.json({ id }); }
      if (method === "DELETE") return new Response(null, { status: 204 });
      return Response.json({ id });
    }
    return new Response(null, { status: 404 });
  });
  return { fetcher, calls, known };
}

const creds = { clientId: "cid", clientSecret: "csecret" };

describe("Google Agenda", () => {
  let db: Db;
  let tenantId: string;
  let ownerId: string;

  beforeEach(async () => {
    vi.spyOn(console, "info").mockImplementation(() => {});
    vi.spyOn(console, "warn").mockImplementation(() => {});
    db = await createTestDb();
    const t = await seedOwnerTenant(db, "Studio", "dona@studio.com");
    tenantId = t.tenantId;
    ownerId = t.userId;
  });

  const connect = (userId = ownerId) => saveConnection(db, { tenantId, userId, googleEmail: "dona@gmail.com", refreshToken: "rt-1", calendarId: "cal-1", calendarName: "Eneven Agenda" });
  const cycle = (google: ReturnType<typeof fakeGoogle>, now = new Date("2030-01-01T12:00:00Z")) => runCalendarCycle(db, { fetcher: google.fetcher, creds, now });
  const eventCalls = (google: ReturnType<typeof fakeGoogle>) => google.calls.filter((c) => c.url.includes("/events"));

  describe("peças puras", () => {
    it("o interruptor vem desligado e só liga com o texto true e as credenciais do Google", () => {
      expect(googleCalendarEnabled({})).toBe(false);
      expect(googleCalendarEnabled({ GOOGLE_CALENDAR_ENABLED: "true" })).toBe(false);
      expect(googleCalendarEnabled({ GOOGLE_CALENDAR_ENABLED: "false", GOOGLE_CLIENT_ID: "a", GOOGLE_CLIENT_SECRET: "b" })).toBe(false);
      expect(googleCalendarEnabled({ GOOGLE_CALENDAR_ENABLED: "true", GOOGLE_CLIENT_ID: "a", GOOGLE_CLIENT_SECRET: "b" })).toBe(true);
    });

    it("o token cifrado só abre com o mesmo contexto e não aparece em texto", () => {
      const sealed = sealSecret("conexao-1", "refresh-token-secreto");
      expect(sealed).not.toContain("refresh-token-secreto");
      expect(openSecret("conexao-1", sealed)).toBe("refresh-token-secreto");
      expect(() => openSecret("conexao-2", sealed)).toThrow();
    });

    it("id do evento é estável e só usa caracteres aceitos pelo Google (a-v e 0-9)", () => {
      const id = googleEventId("0b1c2d3e-4f50-4a6b-8c7d-9e0f1a2b3c4d");
      expect(id).toBe("e0b1c2d3e4f504a6b8c7d9e0f1a2b3c4d");
      expect(id).toMatch(/^[a-v0-9]{5,1024}$/);
    });

    it("o evento leva cliente, serviços, profissional e valor, sem telefone, e não convida ninguém", () => {
      const event = buildCalendarEvent({ id: "0b1c2d3e-4f50-4a6b-8c7d-9e0f1a2b3c4d", status: "confirmed", startsAt: at("10:00"), endsAt: at("10:30"), totalCents: 5000, customerName: "Maria", professionalName: "Bia", services: ["Corte", "Barba"], timeZone: "America/Sao_Paulo" });
      expect(event.summary).toBe("Corte, Barba · Maria");
      expect(event.description).toContain("Profissional: Bia");
      expect(event.colorId).toBe("10");
      expect(event.start.timeZone).toBe("America/Sao_Paulo");
      expect(JSON.stringify(event)).not.toMatch(/attendees|phone|telefone/i);
    });

    it("espera entre tentativas cresce até 1 hora", () => {
      expect([0, 1, 2, 3].map(backoffMs)).toEqual([60_000, 120_000, 240_000, 480_000]);
      expect(backoffMs(50)).toBe(60 * 60_000);
    });
  });

  describe("sincronização", () => {
    it("primeira carga envia os agendamentos futuros, sem repetir na rodada seguinte", async () => {
      const booking = await seedBooking(db, tenantId);
      const connection = await connect();
      const google = fakeGoogle();
      const first = await cycle(google);
      expect(first).toMatchObject({ connections: 1, synced: 1, failed: 0 });
      const posts = eventCalls(google).filter((c) => c.method === "POST");
      expect(posts).toHaveLength(1);
      expect(posts[0].url).toContain("/calendars/cal-1/events");
      expect((posts[0].body as { id: string }).id).toBe(googleEventId(booking.id));
      expect((await db.select().from(googleCalendarEvents).where(eq(googleCalendarEvents.connectionId, connection.id)))).toHaveLength(1);
      expect((await db.select().from(googleCalendarConnections))[0].cursor).not.toBeNull();

      const callsBefore = google.calls.length;
      const second = await cycle(google, new Date("2030-01-01T12:01:00Z"));
      expect(second.synced).toBe(0);
      expect(google.calls.slice(callsBefore).filter((c) => c.url.includes("/events"))).toHaveLength(0);
    });

    it("remarcar atualiza o mesmo evento (cria que já existe vira PUT) e cancelar apaga", async () => {
      const booking = await seedBooking(db, tenantId);
      await connect();
      const google = fakeGoogle();
      await cycle(google);

      const moved = new Date("2030-01-01T12:05:00Z");
      await db.update(bookings).set({ startsAt: at("14:00"), endsAt: at("14:30"), blockedUntil: at("14:30"), updatedAt: moved }).where(eq(bookings.id, booking.id));
      const rescheduled = await cycle(google, new Date("2030-01-01T12:06:00Z"));
      expect(rescheduled.synced).toBe(1);
      expect(eventCalls(google).some((c) => c.method === "PUT" && c.url.endsWith(googleEventId(booking.id)))).toBe(true);

      await db.update(bookings).set({ status: "canceled", canceledAt: moved, updatedAt: new Date("2030-01-01T12:10:00Z") }).where(eq(bookings.id, booking.id));
      const canceled = await cycle(google, new Date("2030-01-01T12:11:00Z"));
      expect(canceled.deleted).toBe(1);
      expect(eventCalls(google).some((c) => c.method === "DELETE" && c.url.endsWith(googleEventId(booking.id)))).toBe(true);
      expect(await db.select().from(googleCalendarEvents)).toHaveLength(0);
    });

    it("conexão desligada não envia nada; ao religar, as mudanças seguem", async () => {
      await seedBooking(db, tenantId);
      await connect();
      await setConnectionEnabled(db, tenantId, ownerId, false);
      const google = fakeGoogle();
      expect((await cycle(google)).connections).toBe(0);
      expect(google.calls).toHaveLength(0);
      await setConnectionEnabled(db, tenantId, ownerId, true);
      expect((await cycle(google)).synced).toBe(1);
    });

    it("profissional recebe só os dele; agendamento que sai para outro profissional some da agenda dele", async () => {
      const [staffUser] = await db.insert(users).values({ email: "caio@x.com", name: "Caio", passwordHash: null }).returning();
      await db.insert(memberships).values({ userId: staffUser.id, tenantId, role: "staff" });
      const [mine] = await db.insert(professionals).values({ tenantId, name: "Caio", userId: staffUser.id }).returning();
      const bia = await seedProfessional(db, tenantId, "Bia");
      const customer = await seedCustomer(db, tenantId);
      const [mineBooking] = await db.insert(bookings).values(bookingValues(tenantId, mine.id, customer.id)).returning();
      const [other] = await db.insert(bookings).values(bookingValues(tenantId, bia.id, customer.id)).returning();
      const eligibility = await connectionEligibility(db, tenantId, staffUser.id);
      expect(eligibility).toEqual({ eligible: true, scope: "own" });
      await connect(staffUser.id);
      const google = fakeGoogle();
      await cycle(google);
      const sent = eventCalls(google).filter((c) => c.method === "POST").map((c) => (c.body as { id: string }).id);
      expect(sent).toEqual([googleEventId(mineBooking.id)]);
      expect(sent).not.toContain(googleEventId(other.id));

      // Remarcado para a Bia: sai da agenda do Caio.
      await db.update(bookings).set({ professionalId: bia.id, startsAt: at("15:00"), endsAt: at("15:30"), blockedUntil: at("15:30"), updatedAt: new Date("2030-01-01T12:05:00Z") }).where(eq(bookings.id, mineBooking.id));
      expect((await cycle(google, new Date("2030-01-01T12:06:00Z"))).deleted).toBe(1);
      expect(await db.select().from(googleCalendarEvents)).toHaveLength(0);
    });

    it("profissional sem cadastro de profissional ligado não pode conectar", async () => {
      const [staffUser] = await db.insert(users).values({ email: "sem@x.com", name: "Sem", passwordHash: null }).returning();
      await db.insert(memberships).values({ userId: staffUser.id, tenantId, role: "staff" });
      expect(await connectionEligibility(db, tenantId, staffUser.id)).toEqual({ eligible: false, reason: "no_professional" });
      expect(await connectionEligibility(db, tenantId, ownerId)).toEqual({ eligible: true, scope: "all" });
    });
  });

  describe("falhas do Google", () => {
    it("acesso retirado (invalid_grant) marca a conexão para reconectar e para de tentar", async () => {
      await seedBooking(db, tenantId);
      await connect();
      const google = fakeGoogle({ token: "invalid_grant" });
      expect(await cycle(google)).toMatchObject({ reconnect: 1, synced: 0 });
      const [row] = await db.select().from(googleCalendarConnections);
      expect(row.status).toBe("needs_reconnect");
      const callsBefore = google.calls.length;
      expect((await cycle(google, new Date("2030-01-01T12:30:00Z"))).connections).toBe(0);
      expect(google.calls.length).toBe(callsBefore);
    });

    it("limite de uso do Google: espera crescente, cursor não avança e a próxima rodada tenta de novo", async () => {
      await seedBooking(db, tenantId);
      await connect();
      const limited = fakeGoogle({ events: "rate" });
      const now = new Date("2030-01-01T12:00:00Z");
      expect(await cycle(limited, now)).toMatchObject({ failed: 1, synced: 0 });
      const [row] = await db.select().from(googleCalendarConnections);
      expect(row).toMatchObject({ failures: 1, status: "active", cursor: null });
      expect(row.nextAttemptAt?.getTime()).toBe(now.getTime() + 120_000);
      // Antes do tempo de espera: não tenta.
      expect((await cycle(fakeGoogle(), new Date(now.getTime() + 60_000))).connections).toBe(0);
      // Depois: envia e zera as falhas.
      const ok = fakeGoogle();
      expect(await cycle(ok, new Date(now.getTime() + 121_000))).toMatchObject({ synced: 1 });
      expect((await db.select().from(googleCalendarConnections))[0]).toMatchObject({ failures: 0, nextAttemptAt: null });
    });

    it("agenda apagada pela pessoa no Google: cria outra e reenvia tudo", async () => {
      const booking = await seedBooking(db, tenantId);
      await connect();
      const gone = fakeGoogle({ events: "calendar_gone" });
      await cycle(gone);
      const [row] = await db.select().from(googleCalendarConnections);
      expect(row.calendarId).toBe("cal-novo");
      expect(row.cursor).toBeNull();
      const ok = fakeGoogle();
      expect(await cycle(ok, new Date("2030-01-01T12:02:00Z"))).toMatchObject({ synced: 1 });
      expect(eventCalls(ok)[0].url).toContain("/calendars/cal-novo/events");
      expect((await db.select().from(googleCalendarEvents))[0].bookingId).toBe(booking.id);
    });

    it("quem saiu do estabelecimento perde a conexão e o acesso é retirado no Google", async () => {
      const [staffUser] = await db.insert(users).values({ email: "saiu@x.com", name: "Saiu", passwordHash: null }).returning();
      await db.insert(memberships).values({ userId: staffUser.id, tenantId, role: "reception" });
      await connect(staffUser.id);
      await db.delete(memberships).where(eq(memberships.userId, staffUser.id));
      const google = fakeGoogle();
      expect(await cycle(google)).toMatchObject({ removed: 1, connections: 0 });
      expect(await db.select().from(googleCalendarConnections)).toHaveLength(0);
      expect(google.calls.some((c) => c.url.includes("/revoke"))).toBe(true);
    });
  });

  describe("conexões e exclusão de conta", () => {
    it("reconectar reaproveita a conexão e a agenda, e troca o token", async () => {
      const first = await connect();
      const second = await saveConnection(db, { tenantId, userId: ownerId, googleEmail: "novo@gmail.com", refreshToken: "rt-2", calendarId: "outra", calendarName: "Eneven Agenda" });
      expect(second.id).toBe(first.id);
      expect(second.calendarId).toBe("cal-1");
      expect(openSecret(second.id, second.refreshTokenEnc)).toBe("rt-2");
      expect(await db.select().from(googleCalendarConnections)).toHaveLength(1);
    });

    it("desconectar retira o acesso e apaga a conexão", async () => {
      await connect();
      const google = fakeGoogle();
      await disconnect(db, tenantId, ownerId, { fetcher: google.fetcher });
      expect(await db.select().from(googleCalendarConnections)).toHaveLength(0);
      expect(google.calls.find((c) => c.url.includes("/revoke"))?.body).toEqual({ token: "rt-1" });
    });

    it("falha ao retirar o acesso no Google não impede apagar a conexão", async () => {
      await connect();
      const broken = vi.fn<typeof fetch>(async () => { throw new Error("sem rede"); });
      expect(await revokeConnections(db, { tenantId }, { fetcher: broken })).toBe(1);
      expect(await db.select().from(googleCalendarConnections)).toHaveLength(0);
    });
  });
});
