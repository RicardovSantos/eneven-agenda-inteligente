import { createHash, randomBytes } from "node:crypto";
import { and, eq, gt } from "drizzle-orm";
import { memberships, sessions, users } from "@/db/schema";
import type { Db } from "@/db/types";

export { SESSION_COOKIE } from "./cookie-names";
export const SESSION_DAYS = 30;
export const SESSION_MAX_AGE_SECONDS = SESSION_DAYS * 24 * 60 * 60;

export type SessionInfo = {
  userId: string;
  tenantId: string | null;
  role: "owner" | "reception" | "staff" | null;
  isSuperAdmin: boolean;
  emailVerified: boolean;
};

/** O banco guarda só o hash SHA-256 do token (o token nunca é gravado). */
export function hashToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

/** Cria a sessão e devolve o token em texto (vai para o cookie). */
export async function createSession(
  db: Db,
  userId: string,
  tenantId: string | null,
): Promise<string> {
  const token = randomBytes(32).toString("base64url");
  await db.insert(sessions).values({
    id: hashToken(token),
    userId,
    tenantId,
    expiresAt: new Date(Date.now() + SESSION_MAX_AGE_SECONDS * 1000),
  });
  return token;
}

/**
 * Carrega a sessão pelo token. Retorna `null` se não existe ou venceu.
 * `role` fica `null` quando o usuário não tem (mais) vínculo com o tenant
 * da sessão, por isso o guard do painel também exige `role`.
 */
export async function getSession(
  db: Db,
  token: string,
  now: Date = new Date(),
): Promise<SessionInfo | null> {
  if (!token) return null;

  const [row] = await db
    .select({
      userId: sessions.userId,
      tenantId: sessions.tenantId,
      role: memberships.role,
      isSuperAdmin: users.isSuperAdmin,
      emailVerifiedAt: users.emailVerifiedAt,
    })
    .from(sessions)
    .innerJoin(users, eq(users.id, sessions.userId))
    .leftJoin(
      memberships,
      and(
        eq(memberships.userId, sessions.userId),
        eq(memberships.tenantId, sessions.tenantId),
      ),
    )
    .where(and(eq(sessions.id, hashToken(token)), gt(sessions.expiresAt, now)))
    .limit(1);

  if (!row) return null;
  return {
    userId: row.userId,
    tenantId: row.tenantId,
    role: row.role,
    isSuperAdmin: row.isSuperAdmin,
    emailVerified: row.emailVerifiedAt !== null,
  };
}

export async function destroySession(db: Db, token: string): Promise<void> {
  if (!token) return;
  await db.delete(sessions).where(eq(sessions.id, hashToken(token)));
}
