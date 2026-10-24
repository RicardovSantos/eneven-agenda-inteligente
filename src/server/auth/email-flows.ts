import { eq, sql } from "drizzle-orm";
import { emailTokens, memberships, tenants, users } from "@/db/schema";
import type { Db } from "@/db/types";
import { buildResetEmail, buildVerifyEmail, resetLink, verifyLink } from "@/server/email/templates";
import { sendEmail } from "@/server/email/send";
import {
  issueEmailToken,
  lastEmailTokenIssuedAt,
  revokeUnusedEmailTokens,
} from "./email-tokens";
import { normalizeEmail } from "./login";
import { hashToken } from "./session";

/** Intervalo mínimo entre dois e-mails do mesmo tipo para o mesmo usuário. */
export const RESEND_COOLDOWN_SECONDS = 60;

/**
 * Reserva o envio de um e-mail do usuário: dentro de uma transação, pega um
 * lock consultivo da transação por `userId:propósito`
 * (`pg_advisory_xact_lock`, serializa pedidos simultâneos do mesmo usuário e
 * tipo sem travar a linha do usuário, o que evitava deadlock com o consumo do
 * token), confere o intervalo de 60 s, invalida os links antigos e emite o
 * novo. Devolve `null` se ainda está no intervalo. O e-mail é enviado por
 * quem chama, depois do commit.
 */
async function reserveToken(
  db: Db,
  userId: string,
  purpose: "verify" | "reset",
  now: Date,
): Promise<string | null> {
  return db.transaction(async (tx) => {
    await tx.execute(sql`select pg_advisory_xact_lock(hashtext(${`${userId}:${purpose}`}::text))`);

    const last = await lastEmailTokenIssuedAt(tx, userId, purpose);
    if (last !== null && now.getTime() - last.getTime() < RESEND_COOLDOWN_SECONDS * 1000) {
      return null;
    }
    await revokeUnusedEmailTokens(tx, userId, purpose);
    return issueEmailToken(tx, userId, purpose, now);
  });
}

/**
 * Envia o e-mail do token recém-emitido. Se o envio falhar, apaga o token
 * (senão ele consumiria o intervalo de 60 s e a pessoa não poderia tentar de
 * novo na hora) e repassa o erro.
 */
async function sendOrDiscardToken(
  db: Db,
  token: string,
  send: () => Promise<void>,
): Promise<void> {
  try {
    await send();
  } catch (error) {
    await db
      .delete(emailTokens)
      .where(eq(emailTokens.id, hashToken(token)))
      .catch((cleanupError: unknown) => {
        console.error("Falha ao descartar o token do e-mail não enviado", cleanupError);
      });
    throw error;
  }
}

export type SendVerificationResult =
  | { status: "sent"; email: string }
  | { status: "cooldown" }
  | { status: "already_verified" }
  | { status: "not_found" };

/**
 * Envia (ou reenvia) o e-mail de confirmação: invalida os links anteriores
 * ainda não usados, emite um novo e envia. Respeita 1 envio por 60 s por
 * usuário. Se o envio falhar o token novo é apagado e a exceção sobe: no
 * cadastro quem chama engole e registra; no "Reenviar e-mail" mostra uma
 * mensagem.
 */
export async function sendVerificationEmail(
  db: Db,
  userId: string,
  now: Date = new Date(),
): Promise<SendVerificationResult> {
  const [user] = await db
    .select({
      email: users.email,
      name: users.name,
      verifiedAt: users.emailVerifiedAt,
      businessName: tenants.name,
    })
    .from(users)
    .leftJoin(memberships, eq(memberships.userId, users.id))
    .leftJoin(tenants, eq(tenants.id, memberships.tenantId))
    .where(eq(users.id, userId))
    .limit(1);

  if (!user) return { status: "not_found" };
  if (user.verifiedAt) return { status: "already_verified" };

  const token = await reserveToken(db, userId, "verify", now);
  if (token === null) return { status: "cooldown" };
  await sendOrDiscardToken(db, token, () =>
    sendEmail({
      to: user.email,
      ...buildVerifyEmail({
        name: user.name,
        businessName: user.businessName ?? "seu estabelecimento",
        link: verifyLink(token),
      }),
    }),
  );
  return { status: "sent", email: user.email };
}

/**
 * Pedido de "esqueci minha senha". Não devolve nada e nunca lança: quem chama
 * responde igual exista a conta ou não. Contas sem senha (futuro login só com
 * Google) também podem redefinir, o que cria uma senha.
 */
export async function requestPasswordReset(
  db: Db,
  rawEmail: string,
  now: Date = new Date(),
): Promise<void> {
  try {
    const [user] = await db
      .select({ id: users.id, email: users.email })
      .from(users)
      .where(eq(users.email, normalizeEmail(rawEmail)))
      .limit(1);
    if (!user) return;

    const token = await reserveToken(db, user.id, "reset", now);
    if (token === null) return;
    await sendOrDiscardToken(db, token, () =>
      sendEmail({
        to: user.email,
        ...buildResetEmail({ email: user.email, link: resetLink(token) }),
      }),
    );
  } catch (error) {
    console.error("Falha ao enviar o e-mail de redefinição de senha", error);
  }
}
