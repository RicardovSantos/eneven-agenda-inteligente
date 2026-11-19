import { randomUUID } from "node:crypto";
import { and, eq } from "drizzle-orm";
import { googleCalendarConnections, memberships, professionals } from "@/db/schema";
import type { Db } from "@/db/types";
import { dropConnection, type CalendarDeps } from "./sync";
import { sealSecret } from "./secret";

export type CalendarConnection = typeof googleCalendarConnections.$inferSelect;

export async function getConnection(db: Db, tenantId: string, userId: string): Promise<CalendarConnection | null> {
  const [row] = await db.select().from(googleCalendarConnections)
    .where(and(eq(googleCalendarConnections.tenantId, tenantId), eq(googleCalendarConnections.userId, userId))).limit(1);
  return row ?? null;
}

/**
 * Quem pode conectar: dono e recepção (recebem a agenda de todos) e profissional que tem um cadastro de
 * profissional ligado ao login (recebe só os dele). Profissional sem esse vínculo não tem o que receber.
 */
export async function connectionEligibility(db: Db, tenantId: string, userId: string): Promise<{ eligible: true; scope: "all" | "own" } | { eligible: false; reason: "not_member" | "no_professional" }> {
  const [member] = await db.select({ role: memberships.role }).from(memberships).where(and(eq(memberships.tenantId, tenantId), eq(memberships.userId, userId))).limit(1);
  if (!member) return { eligible: false, reason: "not_member" };
  if (member.role !== "staff") return { eligible: true, scope: "all" };
  const [own] = await db.select({ id: professionals.id }).from(professionals).where(and(eq(professionals.tenantId, tenantId), eq(professionals.userId, userId))).limit(1);
  return own ? { eligible: true, scope: "own" } : { eligible: false, reason: "no_professional" };
}

/** Grava (ou refaz) a conexão depois do consentimento. Reconectar reaproveita a agenda e o histórico de envios. */
export async function saveConnection(db: Db, input: { tenantId: string; userId: string; googleEmail: string; refreshToken: string; calendarId: string; calendarName: string }, now = new Date()): Promise<CalendarConnection> {
  const existing = await getConnection(db, input.tenantId, input.userId);
  const id = existing?.id ?? randomUUID();
  const refreshTokenEnc = sealSecret(id, input.refreshToken);
  if (existing) {
    const [row] = await db.update(googleCalendarConnections)
      .set({ googleEmail: input.googleEmail, refreshTokenEnc, enabled: true, status: "active", lastError: null, failures: 0, nextAttemptAt: null, updatedAt: now })
      .where(eq(googleCalendarConnections.id, id)).returning();
    return row;
  }
  const [row] = await db.insert(googleCalendarConnections)
    .values({ id, tenantId: input.tenantId, userId: input.userId, googleEmail: input.googleEmail, refreshTokenEnc, calendarId: input.calendarId, calendarName: input.calendarName, createdAt: now, updatedAt: now })
    .returning();
  return row;
}

/** Liga ou desliga o envio sem perder a conexão. Ao religar, as mudanças do período desligado seguem na próxima rodada. */
export async function setConnectionEnabled(db: Db, tenantId: string, userId: string, enabled: boolean, now = new Date()): Promise<void> {
  await db.update(googleCalendarConnections).set({ enabled, failures: 0, nextAttemptAt: null, updatedAt: now })
    .where(and(eq(googleCalendarConnections.tenantId, tenantId), eq(googleCalendarConnections.userId, userId)));
}

/** Desconecta: retira o acesso no Google e apaga a conexão. Os eventos já criados ficam na agenda da pessoa. */
export async function disconnect(db: Db, tenantId: string, userId: string, deps: CalendarDeps = {}): Promise<void> {
  const connection = await getConnection(db, tenantId, userId);
  if (connection) await dropConnection(db, connection, deps);
}

/** Antes de excluir conta: retira o acesso de todas as conexões do estabelecimento (ou só da pessoa). Falhas só vão ao log. */
export async function revokeConnections(db: Db, input: { tenantId: string; userId?: string }, deps: CalendarDeps = {}): Promise<number> {
  const rows = await db.select().from(googleCalendarConnections)
    .where(input.userId ? and(eq(googleCalendarConnections.tenantId, input.tenantId), eq(googleCalendarConnections.userId, input.userId)) : eq(googleCalendarConnections.tenantId, input.tenantId));
  for (const row of rows) await dropConnection(db, row, deps);
  return rows.length;
}
