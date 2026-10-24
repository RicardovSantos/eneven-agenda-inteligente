import { randomBytes } from "node:crypto";
import { and, desc, eq, isNull } from "drizzle-orm";
import { emailTokens, sessions, users } from "@/db/schema";
import type { Db } from "@/db/types";
import { AuthError } from "./errors";
import { hashPassword } from "./password";
import { newPasswordSchema } from "./schemas";
import { hashToken } from "./session";

export type EmailTokenPurpose = "verify" | "reset";

const HOUR_MS = 60 * 60 * 1000;

/** Validade de cada tipo de link: confirmação 48 h, redefinição 1 h. */
export const EMAIL_TOKEN_TTL_MS: Record<EmailTokenPurpose, number> = {
  verify: 48 * HOUR_MS,
  reset: HOUR_MS,
};

export type TokenFailure = "invalid" | "expired" | "used";
export type TokenCheck = { ok: true; userId: string } | { ok: false; reason: TokenFailure };

/**
 * Emite um token de uso único e devolve o texto (vai no link do e-mail). O
 * banco guarda só o hash SHA-256, como nas sessões.
 */
export async function issueEmailToken(
  db: Db,
  userId: string,
  purpose: EmailTokenPurpose,
  now: Date = new Date(),
): Promise<string> {
  const token = randomBytes(32).toString("base64url");
  await db.insert(emailTokens).values({
    id: hashToken(token),
    userId,
    purpose,
    expiresAt: new Date(now.getTime() + EMAIL_TOKEN_TTL_MS[purpose]),
  });
  return token;
}

/**
 * Confere o token sem gastá-lo (para páginas que só precisam saber se o link
 * ainda vale). Token de outro tipo conta como `invalid`.
 */
export async function checkEmailToken(
  db: Db,
  token: string,
  purpose: EmailTokenPurpose,
  now: Date = new Date(),
): Promise<TokenCheck> {
  if (!token) return { ok: false, reason: "invalid" };

  const [row] = await db
    .select({
      userId: emailTokens.userId,
      purpose: emailTokens.purpose,
      expiresAt: emailTokens.expiresAt,
      usedAt: emailTokens.usedAt,
    })
    .from(emailTokens)
    .where(eq(emailTokens.id, hashToken(token)))
    .limit(1);

  if (!row || row.purpose !== purpose) return { ok: false, reason: "invalid" };
  if (row.usedAt) return { ok: false, reason: "used" };
  if (row.expiresAt.getTime() <= now.getTime()) return { ok: false, reason: "expired" };
  return { ok: true, userId: row.userId };
}

/**
 * Confere e gasta o token. O `UPDATE ... WHERE used_at IS NULL` garante que,
 * mesmo com dois cliques simultâneos, só um deles consome o link.
 */
export async function consumeEmailToken(
  db: Db,
  token: string,
  purpose: EmailTokenPurpose,
  now: Date = new Date(),
): Promise<TokenCheck> {
  const check = await checkEmailToken(db, token, purpose, now);
  if (!check.ok) return check;

  const claimed = await db
    .update(emailTokens)
    .set({ usedAt: now })
    .where(and(eq(emailTokens.id, hashToken(token)), isNull(emailTokens.usedAt)))
    .returning({ id: emailTokens.id });

  return claimed.length > 0 ? check : { ok: false, reason: "used" };
}

/** Descarta os links ainda não usados do usuário (um novo pedido invalida o anterior). */
export async function revokeUnusedEmailTokens(
  db: Db,
  userId: string,
  purpose: EmailTokenPurpose,
): Promise<void> {
  await db
    .delete(emailTokens)
    .where(
      and(
        eq(emailTokens.userId, userId),
        eq(emailTokens.purpose, purpose),
        isNull(emailTokens.usedAt),
      ),
    );
}

/**
 * Quando o último token desse tipo foi emitido (a tabela não guarda a data de
 * criação, mas a validade é fixa: `emissão = expiresAt - validade`).
 */
export async function lastEmailTokenIssuedAt(
  db: Db,
  userId: string,
  purpose: EmailTokenPurpose,
): Promise<Date | null> {
  const [row] = await db
    .select({ expiresAt: emailTokens.expiresAt })
    .from(emailTokens)
    .where(and(eq(emailTokens.userId, userId), eq(emailTokens.purpose, purpose)))
    .orderBy(desc(emailTokens.expiresAt))
    .limit(1);
  return row ? new Date(row.expiresAt.getTime() - EMAIL_TOKEN_TTL_MS[purpose]) : null;
}

/** Consome um token `verify` e marca `users.emailVerifiedAt`. */
export async function verifyEmail(
  db: Db,
  token: string,
  now: Date = new Date(),
): Promise<TokenCheck> {
  return db.transaction(async (tx) => {
    const result = await consumeEmailToken(tx, token, "verify", now);
    if (result.ok) {
      await tx
        .update(users)
        .set({ emailVerifiedAt: now })
        .where(and(eq(users.id, result.userId), isNull(users.emailVerifiedAt)));
    }
    return result;
  });
}

/**
 * Consome um token `reset`, grava a nova senha e apaga TODAS as sessões do
 * usuário (quem tinha a senha antiga é deslogado), tudo numa transação. A
 * senha é validada antes de gastar o link: senha inválida lança `AuthError`.
 */
export async function resetPassword(
  db: Db,
  token: string,
  newPassword: string,
  now: Date = new Date(),
): Promise<TokenCheck> {
  const parsed = newPasswordSchema.safeParse(newPassword);
  if (!parsed.success) {
    const message = parsed.error.issues[0]?.message ?? "Senha inválida.";
    throw new AuthError(message, "validation", { password: message });
  }
  const passwordHash = await hashPassword(parsed.data);

  return db.transaction(async (tx) => {
    const result = await consumeEmailToken(tx, token, "reset", now);
    if (!result.ok) return result;

    await tx.update(users).set({ passwordHash }).where(eq(users.id, result.userId));
    await tx.delete(sessions).where(eq(sessions.userId, result.userId));
    await revokeUnusedEmailTokens(tx, result.userId, "reset");
    return result;
  });
}
