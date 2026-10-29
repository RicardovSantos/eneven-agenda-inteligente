import { and, eq } from "drizzle-orm";
import { Google } from "arctic";
import { z } from "zod";
import { auditLog, oauthAccounts, sessions, users } from "@/db/schema";
import type { Db } from "@/db/types";
import { revokeUnusedEmailTokens } from "./email-tokens";
import { AuthError } from "./errors";
import { normalizeEmail } from "./login";
import { completeGoogleSchema, toFieldErrors } from "./schemas";
import { GOOGLE_PENDING_PURPOSE } from "./cookie-names";
import { signValue, verifyValue } from "./signed-cookie";
import { createTenantWithOwner } from "./signup";

export const GOOGLE_PROVIDER = "google";
export const GOOGLE_SCOPES = ["openid", "email", "profile"];

// Nomes dos cookies do fluxo OAuth e do perfil pendente: ver `cookie-names.ts`.
export {
  GOOGLE_PENDING_COOKIE,
  GOOGLE_PENDING_PURPOSE,
  OAUTH_INTENT_COOKIE,
  OAUTH_STATE_COOKIE,
  OAUTH_VERIFIER_COOKIE,
} from "./cookie-names";
export const OAUTH_COOKIE_MAX_AGE_SECONDS = 10 * 60;
export const GOOGLE_PENDING_MAX_AGE_SECONDS = 15 * 60;

export const GOOGLE_ERROR_MESSAGE =
  "Não foi possível entrar com o Google. Tente de novo ou use seu e-mail.";

export type GoogleProfile = {
  sub: string;
  email: string;
  emailVerified: boolean;
  name: string;
  picture: string | null;
};

export type ResolveGoogleResult =
  | { kind: "existing"; userId: string }
  | { kind: "new" }
  | { kind: "error"; reason: "email_not_verified" };

// --- configuração ---

/** O botão do Google só existe quando as duas credenciais estão definidas. */
export function isGoogleConfigured(): boolean {
  return Boolean(process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET);
}

/**
 * Endereço público para montar URLs absolutas (atrás de proxy o `request.url`
 * é interno). Em produção `APP_URL` é obrigatório: a URI de retorno do Google
 * nunca é montada a partir da origem da requisição. Fora de produção cai na
 * origem recebida (desenvolvimento em localhost).
 */
export function publicBaseUrl(fallbackOrigin: string): string {
  const configured = process.env.APP_URL;
  if (!configured && process.env.NODE_ENV === "production") {
    throw new Error("APP_URL não definido. Configure o endereço público da aplicação.");
  }
  return (configured || fallbackOrigin).replace(/\/+$/, "");
}

/** Cliente OAuth do Google, ou `null` sem credenciais. */
export function createGoogleClient(baseUrl: string): Google | null {
  const clientId = process.env.GOOGLE_CLIENT_ID;
  const clientSecret = process.env.GOOGLE_CLIENT_SECRET;
  if (!clientId || !clientSecret) return null;
  return new Google(clientId, clientSecret, `${baseUrl}/api/auth/google/callback`);
}

// --- id_token ---

const emailSchema = z.email().max(254);

/**
 * Lê as claims do id_token. `email_verified` pode vir como booleano ou como
 * texto (`"true"`). Retorna `null` sem `sub` ou sem e-mail válido.
 */
export function parseGoogleClaims(claims: object): GoogleProfile | null {
  const c = claims as Record<string, unknown>;
  const sub = typeof c.sub === "string" ? c.sub : "";
  const email = emailSchema.safeParse(
    typeof c.email === "string" ? normalizeEmail(c.email) : "",
  );
  if (!sub || !email.success) return null;

  const name = typeof c.name === "string" ? c.name.trim().slice(0, 120) : "";
  const picture =
    typeof c.picture === "string" && c.picture.startsWith("https://") ? c.picture : null;
  return {
    sub,
    email: email.data,
    emailVerified: c.email_verified === true || c.email_verified === "true",
    name: name || email.data.split("@")[0],
    picture,
  };
}

/** O id_token precisa ter sido emitido para o nosso cliente, pelo Google. */
export function isIdTokenForUs(claims: object, clientId: string): boolean {
  const { aud, iss } = claims as { aud?: unknown; iss?: unknown };
  const audiences = Array.isArray(aud) ? aud : [aud];
  return (
    audiences.includes(clientId) &&
    (iss === "https://accounts.google.com" || iss === "accounts.google.com")
  );
}

// --- usuário ---

/**
 * Proteção contra pré-sequestro: quando algo prova a posse do e-mail (Google ou
 * convite) de uma conta cujo e-mail nunca foi confirmado, a senha (que pode ter
 * sido definida por outra pessoa), as sessões e os links pendentes são
 * descartados e o e-mail passa a confirmado. Deve rodar numa transação, com o
 * usuário já travado.
 */
export async function discardUnverifiedCredentials(
  tx: Db,
  userId: string,
  now: Date,
): Promise<void> {
  await tx
    .update(users)
    .set({ passwordHash: null, emailVerifiedAt: now })
    .where(eq(users.id, userId));
  await tx.delete(sessions).where(eq(sessions.userId, userId));
  await revokeUnusedEmailTokens(tx, userId, "verify");
  await revokeUnusedEmailTokens(tx, userId, "reset");
}

/**
 * Decide o que fazer com um perfil do Google:
 * 1. conta Google já vinculada (`sub`) -> `existing`;
 * 2. e-mail não verificado no Google -> `error` (nunca vincula a ninguém);
 * 3. e-mail verificado que já tem usuário -> vincula e devolve `existing`.
 *    Se o e-mail da conta nunca tinha sido confirmado, a senha, as sessões e
 *    os links de e-mail pendentes são descartados (proteção contra
 *    pré-sequestro) e o e-mail passa a confirmado; sempre grava `audit_log`;
 * 4. senão -> `new` (falta criar o estabelecimento).
 */
export async function resolveGoogleUser(
  db: Db,
  profile: GoogleProfile,
  now: Date = new Date(),
): Promise<ResolveGoogleResult> {
  const [linked] = await db
    .select({ userId: oauthAccounts.userId })
    .from(oauthAccounts)
    .where(
      and(
        eq(oauthAccounts.provider, GOOGLE_PROVIDER),
        eq(oauthAccounts.providerUserId, profile.sub),
      ),
    )
    .limit(1);
  if (linked) return { kind: "existing", userId: linked.userId };

  if (!profile.emailVerified) return { kind: "error", reason: "email_not_verified" };

  const email = normalizeEmail(profile.email);
  const [user] = await db
    .select({ id: users.id })
    .from(users)
    .where(eq(users.email, email))
    .limit(1);
  if (!user) return { kind: "new" };

  await db.transaction(async (tx) => {
    // Trava o usuário: dois retornos simultâneos do Google não vinculam duas vezes.
    const [locked] = await tx
      .select({ emailVerifiedAt: users.emailVerifiedAt })
      .from(users)
      .where(eq(users.id, user.id))
      .for("update");
    if (!locked) return;

    const inserted = await tx
      .insert(oauthAccounts)
      .values({
        provider: GOOGLE_PROVIDER,
        providerUserId: profile.sub,
        userId: user.id,
        email,
      })
      .onConflictDoNothing()
      .returning({ userId: oauthAccounts.userId });
    if (inserted.length === 0) return; // outro pedido já vinculou

    // Se o e-mail da conta nunca foi confirmado, quem definiu a senha pode não
    // ser o dono do e-mail (pré-sequestro). O Google prova a posse: a senha
    // antiga, as sessões e os links pendentes deixam de valer.
    const clearedPassword = locked.emailVerifiedAt === null;
    if (clearedPassword) await discardUnverifiedCredentials(tx, user.id, now);
    await tx.insert(auditLog).values({
      actorUserId: user.id,
      action: "google_link",
      details: { clearedPassword },
    });
  });
  return { kind: "existing", userId: user.id };
}

/**
 * Cadastro de quem chegou pelo Google: cria estabelecimento (teste de 14
 * dias), usuário sem senha com e-mail já confirmado, vínculo `owner` e o
 * vínculo com a conta Google, tudo numa transação. O nome da pessoa vem do
 * Google. Lança `AuthError` para dados inválidos ou e-mail que já tem conta.
 */
export async function completeGoogleSignup(
  db: Db,
  profile: GoogleProfile,
  input: { businessName: string; whatsapp: string },
  now: Date = new Date(),
): Promise<{ userId: string; tenantId: string; slug: string }> {
  if (!profile.emailVerified) {
    throw new AuthError(GOOGLE_ERROR_MESSAGE, "unavailable");
  }
  const parsed = completeGoogleSchema.safeParse(input);
  if (!parsed.success) {
    const fieldErrors = toFieldErrors(parsed.error);
    throw new AuthError(
      Object.values(fieldErrors)[0] ?? "Dados inválidos.",
      "validation",
      fieldErrors,
    );
  }

  const email = normalizeEmail(profile.email);
  return createTenantWithOwner(
    db,
    {
      businessName: parsed.data.businessName,
      ownerName: profile.name,
      email,
      whatsapp: parsed.data.whatsapp,
      passwordHash: null,
      emailVerifiedAt: now,
    },
    now,
    async (tx, { userId }) => {
      await tx.insert(oauthAccounts).values({
        provider: GOOGLE_PROVIDER,
        providerUserId: profile.sub,
        userId,
        email,
      });
    },
  );
}

// --- perfil pendente (cookie assinado) ---

const pendingSchema = z.object({
  sub: z.string().min(1),
  email: emailSchema,
  emailVerified: z.literal(true),
  name: z.string().min(1).max(120),
  picture: z.string().startsWith("https://").nullable(),
});

/** Assina o perfil para o cookie `ea_google_pending` (15 min). */
export function signPendingProfile(profile: GoogleProfile): string {
  return signValue(profile, GOOGLE_PENDING_MAX_AGE_SECONDS, GOOGLE_PENDING_PURPOSE);
}

/** Perfil do cookie `ea_google_pending`, ou `null` se ausente, inválido ou vencido. */
export function parsePendingProfile(value: string | undefined): GoogleProfile | null {
  if (!value) return null;
  const parsed = pendingSchema.safeParse(verifyValue(value, GOOGLE_PENDING_PURPOSE));
  return parsed.success ? parsed.data : null;
}
