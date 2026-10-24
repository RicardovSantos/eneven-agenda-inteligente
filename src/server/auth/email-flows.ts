import { eq } from "drizzle-orm";
import { memberships, tenants, users } from "@/db/schema";
import type { Db } from "@/db/types";
import { buildResetEmail, buildVerifyEmail, resetLink, verifyLink } from "@/server/email/templates";
import { sendEmail } from "@/server/email/send";
import {
  issueEmailToken,
  lastEmailTokenIssuedAt,
  revokeUnusedEmailTokens,
} from "./email-tokens";
import { normalizeEmail } from "./login";

/** Intervalo mínimo entre dois e-mails do mesmo tipo para o mesmo usuário. */
export const RESEND_COOLDOWN_SECONDS = 60;

async function inCooldown(
  db: Db,
  userId: string,
  purpose: "verify" | "reset",
  now: Date,
): Promise<boolean> {
  const last = await lastEmailTokenIssuedAt(db, userId, purpose);
  return last !== null && now.getTime() - last.getTime() < RESEND_COOLDOWN_SECONDS * 1000;
}

export type SendVerificationResult =
  | { status: "sent"; email: string }
  | { status: "cooldown" }
  | { status: "already_verified" }
  | { status: "not_found" };

/**
 * Envia (ou reenvia) o e-mail de confirmação: invalida os links anteriores
 * ainda não usados, emite um novo e envia. Respeita 1 envio por 60 s por
 * usuário. Se o envio falhar a exceção sobe: no cadastro quem chama engole e
 * registra; no "Reenviar e-mail" mostra uma mensagem.
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
  if (await inCooldown(db, userId, "verify", now)) return { status: "cooldown" };

  await revokeUnusedEmailTokens(db, userId, "verify");
  const token = await issueEmailToken(db, userId, "verify", now);
  await sendEmail({
    to: user.email,
    ...buildVerifyEmail({
      name: user.name,
      businessName: user.businessName ?? "seu estabelecimento",
      link: verifyLink(token),
    }),
  });
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
    if (await inCooldown(db, user.id, "reset", now)) return;

    await revokeUnusedEmailTokens(db, user.id, "reset");
    const token = await issueEmailToken(db, user.id, "reset", now);
    await sendEmail({
      to: user.email,
      ...buildResetEmail({ email: user.email, link: resetLink(token) }),
    });
  } catch (error) {
    console.error("Falha ao enviar o e-mail de redefinição de senha", error);
  }
}
