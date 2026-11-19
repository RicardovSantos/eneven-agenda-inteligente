import { and, asc, eq, gt, gte, inArray, isNull, lte, ne, notExists, or, sql } from "drizzle-orm";
import { bookingServices, bookings, customers, googleCalendarConnections, googleCalendarEvents, memberships, professionals, tenants } from "@/db/schema";
import type { Db } from "@/db/types";
import { buildCalendarEvent, googleEventId, type CalendarBooking } from "./event-builder";
import { CALENDAR_NAME } from "./config";
import { GoogleApiError, createCalendar, deleteEvent, refreshAccessToken, revokeToken, upsertEvent } from "./google-api";
import { openSecret } from "./secret";

type Connection = typeof googleCalendarConnections.$inferSelect;

export type CalendarDeps = {
  fetcher?: typeof fetch;
  now?: Date;
  creds?: { clientId: string; clientSecret: string };
};

export type CycleResult = { connections: number; synced: number; deleted: number; failed: number; reconnect: number; removed: number };

/** Releitura das mudanças com folga: uma transação lenta pode gravar `updated_at` anterior ao que já lemos. */
const LAG_MS = 2 * 60_000;
const BACKFILL_LIMIT = 1000;
const INCREMENTAL_LIMIT = 200;
const PAST_WINDOW_MS = 7 * 86_400_000;

/** Espera crescente depois de uma falha temporária (limite do Google, falha de rede): 1, 2, 4... até 1 hora. */
export function backoffMs(failures: number): number {
  return Math.min(60 * 60_000, 60_000 * 2 ** Math.max(0, Math.min(failures, 6)));
}

function credsFromEnv(): { clientId: string; clientSecret: string } {
  const clientId = process.env.GOOGLE_CLIENT_ID;
  const clientSecret = process.env.GOOGLE_CLIENT_SECRET;
  if (!clientId || !clientSecret) throw new Error("Credenciais do Google não configuradas.");
  return { clientId, clientSecret };
}

/** Um ciclo: limpa conexões de quem saiu da equipe e sincroniza as conexões ativas que já podem rodar. */
export async function runCalendarCycle(db: Db, deps: CalendarDeps = {}, limit = 50): Promise<CycleResult> {
  const now = deps.now ?? new Date();
  const result: CycleResult = { connections: 0, synced: 0, deleted: 0, failed: 0, reconnect: 0, removed: 0 };

  // Quem deixou o estabelecimento não pode continuar recebendo a agenda dele no Google.
  const orphans = await db.select().from(googleCalendarConnections).where(notExists(
    db.select({ one: sql`1` }).from(memberships).where(and(eq(memberships.userId, googleCalendarConnections.userId), eq(memberships.tenantId, googleCalendarConnections.tenantId))),
  ));
  for (const orphan of orphans) {
    await dropConnection(db, orphan, deps);
    result.removed++;
  }

  const due = await db.select().from(googleCalendarConnections)
    .where(and(eq(googleCalendarConnections.enabled, true), eq(googleCalendarConnections.status, "active"), or(isNull(googleCalendarConnections.nextAttemptAt), lte(googleCalendarConnections.nextAttemptAt, now))))
    .orderBy(asc(googleCalendarConnections.lastSyncedAt)).limit(limit);
  for (const connection of due) {
    result.connections++;
    try {
      const done = await syncConnection(db, connection, deps);
      result.synced += done.synced;
      result.deleted += done.deleted;
    } catch (error) {
      if (error instanceof GoogleApiError && error.needsReconnect) {
        result.reconnect++;
        await db.update(googleCalendarConnections).set({ status: "needs_reconnect", lastError: "O Google recusou o acesso. Reconecte a conta.", updatedAt: now }).where(eq(googleCalendarConnections.id, connection.id));
      } else {
        result.failed++;
        const failures = connection.failures + 1;
        console.warn(`Google Agenda: sincronização falhou (conexão ${connection.id}, tentativa ${failures}): ${error instanceof Error ? error.message : "erro"}`);
        await db.update(googleCalendarConnections).set({ failures, nextAttemptAt: new Date(now.getTime() + backoffMs(failures)), lastError: "Não foi possível falar com o Google agora. Tentamos de novo em instantes.", updatedAt: now }).where(eq(googleCalendarConnections.id, connection.id));
      }
    }
  }
  return result;
}

/** Remove a conexão (e, pelo cascade, o mapa de eventos). Os eventos já criados ficam na agenda da pessoa. */
export async function dropConnection(db: Db, connection: Connection, deps: CalendarDeps = {}): Promise<void> {
  try {
    await revokeToken(openSecret(connection.id, connection.refreshTokenEnc), deps.fetcher);
  } catch (error) {
    console.warn("Google Agenda: não foi possível retirar o acesso no Google", error instanceof Error ? error.message : "erro");
  }
  await db.delete(googleCalendarConnections).where(eq(googleCalendarConnections.id, connection.id));
}

type BookingRow = typeof bookings.$inferSelect;

export async function syncConnection(db: Db, connection: Connection, deps: CalendarDeps = {}): Promise<{ synced: number; deleted: number }> {
  const now = deps.now ?? new Date();
  const out = { synced: 0, deleted: 0 };

  const [member] = await db.select({ role: memberships.role }).from(memberships)
    .where(and(eq(memberships.userId, connection.userId), eq(memberships.tenantId, connection.tenantId))).limit(1);
  if (!member) return out;
  // Dono e recepção recebem os agendamentos de todos; profissional, só os dele.
  const ownProfessionals = member.role === "staff"
    ? new Set((await db.select({ id: professionals.id }).from(professionals).where(and(eq(professionals.tenantId, connection.tenantId), eq(professionals.userId, connection.userId)))).map((row) => row.id))
    : null;

  const backfill = connection.cursor === null;
  const rows: BookingRow[] = backfill
    ? await db.select().from(bookings).where(and(eq(bookings.tenantId, connection.tenantId), gte(bookings.startsAt, now), ne(bookings.status, "canceled"))).orderBy(asc(bookings.startsAt)).limit(BACKFILL_LIMIT)
    : await db.select().from(bookings).where(and(eq(bookings.tenantId, connection.tenantId), gt(bookings.updatedAt, new Date(connection.cursor!.getTime() - LAG_MS)), gte(bookings.startsAt, new Date(now.getTime() - PAST_WINDOW_MS)))).orderBy(asc(bookings.updatedAt)).limit(INCREMENTAL_LIMIT);

  if (rows.length > 0) {
    const ids = rows.map((row) => row.id);
    const existing = new Map((await db.select().from(googleCalendarEvents).where(and(eq(googleCalendarEvents.connectionId, connection.id), inArray(googleCalendarEvents.bookingId, ids)))).map((row) => [row.bookingId, row]));
    const [tenant] = await db.select({ timezone: tenants.timezone }).from(tenants).where(eq(tenants.id, connection.tenantId)).limit(1);
    const customerRows = await db.select({ id: customers.id, name: customers.name }).from(customers).where(inArray(customers.id, [...new Set(rows.map((row) => row.customerId))]));
    const professionalRows = await db.select({ id: professionals.id, name: professionals.name }).from(professionals).where(inArray(professionals.id, [...new Set(rows.map((row) => row.professionalId))]));
    const serviceRows = await db.select({ bookingId: bookingServices.bookingId, name: bookingServices.name, position: bookingServices.position }).from(bookingServices).where(inArray(bookingServices.bookingId, ids));
    const customerName = new Map(customerRows.map((row) => [row.id, row.name]));
    const professionalName = new Map(professionalRows.map((row) => [row.id, row.name]));
    const serviceNames = new Map<string, string[]>();
    for (const row of [...serviceRows].sort((a, b) => a.position - b.position)) serviceNames.set(row.bookingId, [...(serviceNames.get(row.bookingId) ?? []), row.name]);

    let accessToken: string | null = null;
    const token = async () => {
      accessToken ??= (await refreshAccessToken(openSecret(connection.id, connection.refreshTokenEnc), deps.creds ?? credsFromEnv(), deps.fetcher)).accessToken;
      return accessToken;
    };

    for (const row of rows) {
      const mapped = existing.get(row.id);
      const mine = ownProfessionals === null || ownProfessionals.has(row.professionalId);
      try {
        if (row.status === "canceled" || !mine) {
          // Cancelado, ou remarcado para outro profissional: o evento sai da agenda desta pessoa.
          if (mapped) {
            await deleteEvent(await token(), connection.calendarId, mapped.googleEventId, deps.fetcher);
            await db.delete(googleCalendarEvents).where(eq(googleCalendarEvents.id, mapped.id));
            out.deleted++;
          }
          continue;
        }
        if (mapped && mapped.syncedUpdatedAt.getTime() >= row.updatedAt.getTime()) continue;
        const view: CalendarBooking = {
          id: row.id, status: row.status, startsAt: row.startsAt, endsAt: row.endsAt, totalCents: row.totalCents,
          customerName: customerName.get(row.customerId) ?? "Cliente", professionalName: professionalName.get(row.professionalId) ?? "Profissional",
          services: serviceNames.get(row.id) ?? [], timeZone: tenant?.timezone ?? "America/Sao_Paulo",
        };
        await upsertEvent(await token(), connection.calendarId, buildCalendarEvent(view), deps.fetcher);
        await db.insert(googleCalendarEvents).values({ tenantId: connection.tenantId, connectionId: connection.id, bookingId: row.id, googleEventId: googleEventId(row.id), syncedUpdatedAt: row.updatedAt })
          .onConflictDoUpdate({ target: [googleCalendarEvents.connectionId, googleCalendarEvents.bookingId], set: { syncedUpdatedAt: row.updatedAt } });
        out.synced++;
      } catch (error) {
        // A pessoa apagou a agenda "Eneven Agenda" no Google: cria outra e reenvia tudo na próxima rodada.
        if (error instanceof GoogleApiError && error.calendarGone) {
          const calendarId = await createCalendar(await token(), { summary: CALENDAR_NAME, timeZone: tenant?.timezone ?? "America/Sao_Paulo" }, deps.fetcher);
          await db.delete(googleCalendarEvents).where(eq(googleCalendarEvents.connectionId, connection.id));
          await db.update(googleCalendarConnections).set({ calendarId, cursor: null, updatedAt: now }).where(eq(googleCalendarConnections.id, connection.id));
          return out;
        }
        // Falha de conexão ou limite: para e tenta de novo depois (o cursor não avança). Erro só deste
        // agendamento (ex.: dado recusado pelo Google): registra e segue, para não travar os outros.
        if (error instanceof GoogleApiError && (error.needsReconnect || error.retryable)) throw error;
        if (!(error instanceof GoogleApiError)) throw error;
        console.warn(`Google Agenda: agendamento ${row.id} recusado (${error.reason})`);
      }
    }
  }

  const maxUpdated = rows.reduce((max, row) => (row.updatedAt.getTime() > max ? row.updatedAt.getTime() : max), 0);
  const truncated = backfill && rows.length >= BACKFILL_LIMIT;
  const cursor = truncated ? null : backfill ? now : new Date(Math.max(connection.cursor!.getTime(), maxUpdated));
  await db.update(googleCalendarConnections).set({ cursor, lastSyncedAt: now, failures: 0, nextAttemptAt: null, lastError: null, updatedAt: now }).where(eq(googleCalendarConnections.id, connection.id));
  return out;
}
