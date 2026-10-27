import { and, eq, isNull } from "drizzle-orm";
import {
  invitations,
  memberships,
  oauthAccounts,
  professionals,
  sessions,
  tenants,
  users,
} from "@/db/schema";
import type { Db } from "@/db/types";
import { revokeUnusedEmailTokens } from "@/server/auth/email-tokens";
import {
  discardUnverifiedCredentials,
  GOOGLE_PROVIDER,
  resolveGoogleUser,
  type GoogleProfile,
} from "@/server/auth/google";
import { normalizeEmail } from "@/server/auth/login";
import { hashPassword } from "@/server/auth/password";
import { newPasswordSchema, toFieldErrors } from "@/server/auth/schemas";
import { hashToken } from "@/server/auth/session";
import { withTenantTx } from "@/server/tenant-db";
import { z } from "zod";
import { TeamError, UUID, wrongAccount } from "./errors";

export type InvitationView =
  | {
      status: "valid";
      tenantName: string;
      role: "owner" | "reception" | "staff";
      email: string;
      name: string;
      hasAccount: boolean;
    }
  | { status: "invalid" };

export type AcceptInput =
  | { userId: string }
  /** `name` é obrigatório no convite de equipe; o convite de proprietário só pede a senha. */
  | { name?: string; password: string }
  | { googleProfile: GoogleProfile };

type InvitationRow = typeof invitations.$inferSelect;

const invalid = () => new TeamError("invalid_invitation");

function isUsable(row: InvitationRow, now: Date): boolean {
  return !row.acceptedAt && !row.revokedAt && row.expiresAt.getTime() > now.getTime();
}

/**
 * Busca o convite pelo hash do token. É a ÚNICA leitura de `invitations` fora
 * de `withTenant`: quem chega pelo link ainda não tem sessão nem estabelecimento
 * (mesmo caso de `findBookingByManageToken`). O `tenantId` sai da linha, nunca
 * da entrada.
 */
async function findByToken(db: Db, token: string): Promise<InvitationRow | null> {
  if (!token) return null;
  const [row] = await db
    .select()
    .from(invitations)
    .where(eq(invitations.tokenHash, hashToken(token)))
    .limit(1);
  return row ?? null;
}

/** O que a página do convite mostra. Convite inexistente, vencido, revogado ou usado = `invalid`. */
export async function getInvitation(
  db: Db,
  token: string,
  now: Date = new Date(),
): Promise<InvitationView> {
  const row = await findByToken(db, token);
  if (!row || !isUsable(row, now)) return { status: "invalid" };

  const [tenant] = await db
    .select({ name: tenants.name })
    .from(tenants)
    .where(eq(tenants.id, row.tenantId))
    .limit(1);
  if (!tenant) return { status: "invalid" };
  const [account] = await db
    .select({ id: users.id })
    .from(users)
    .where(eq(users.email, row.email))
    .limit(1);

  return {
    status: "valid",
    tenantName: tenant.name,
    role: row.role,
    email: row.email,
    name: row.name,
    hasAccount: Boolean(account),
  };
}

const nameSchema = z
  .string()
  .trim()
  .min(1, "Informe seu nome.")
  .max(120, "Seu nome pode ter no máximo 120 caracteres.");
const teamCredentialsSchema = z.object({ name: nameSchema, password: newPasswordSchema });
const ownerCredentialsSchema = z.object({ password: newPasswordSchema });

/** Garante que o usuário (já travado) não tem vínculo com este nem com outro estabelecimento. */
async function assertNoMembership(tx: Db, userId: string, tenantId: string): Promise<void> {
  const rows = await tx
    .select({ tenantId: memberships.tenantId })
    .from(memberships)
    .where(eq(memberships.userId, userId));
  if (rows.some((m) => m.tenantId === tenantId)) throw new TeamError("already_member");
  if (rows.length > 0) throw new TeamError("other_tenant");
}

/** Usuário (travado) com o e-mail do convite; senão `wrong_account`. */
async function lockUserForInvite(tx: Db, userId: string, inv: InvitationRow) {
  if (!UUID.test(userId)) throw wrongAccount(inv.email);
  const [user] = await tx
    .select({ id: users.id, email: users.email, emailVerifiedAt: users.emailVerifiedAt })
    .from(users)
    .where(eq(users.id, userId))
    .for("update");
  if (!user || user.email !== inv.email) throw wrongAccount(inv.email);
  return user;
}

/** Proprietário atual do estabelecimento do convite. */
async function ownerOf(tx: Db, tenantId: string) {
  const [owner] = await tx
    .select({ id: users.id, email: users.email, emailVerifiedAt: users.emailVerifiedAt })
    .from(memberships)
    .innerJoin(users, eq(users.id, memberships.userId))
    .where(and(eq(memberships.tenantId, tenantId), eq(memberships.role, "owner")))
    .limit(1);
  return owner ?? null;
}

type Credentials = { name: string; passwordHash: string };

/**
 * Aceita o convite. O token é de uso único: a linha é travada (`FOR UPDATE`)
 * e, depois do aceite, quem chegar em seguida (ou em paralelo) recebe
 * `invalid_invitation`. Tudo ou nada, numa transação. Não cria sessão: quem
 * chama cria a sessão com o `{ userId, tenantId }` devolvido.
 *
 * Três formas de aceitar:
 *  - `{ name, password }`: cria o usuário (e-mail confirmado). Se o e-mail já
 *    tem conta, não troca a senha dela: pede para entrar (`wrong_account`).
 *    No convite de proprietário define a senha do dono (como uma redefinição:
 *    derruba as sessões);
 *  - `{ userId }`: usuário da sessão, cujo e-mail precisa ser o do convite;
 *  - `{ googleProfile }`: e-mail verificado do Google igual ao do convite.
 *    Segue as regras de `resolveGoogleUser` (inclusive o descarte de senha de
 *    conta nunca confirmada).
 */
export async function acceptInvitation(
  db: Db,
  token: string,
  input: AcceptInput,
  now: Date = new Date(),
): Promise<{ userId: string; tenantId: string }> {
  const pre = await findByToken(db, token);
  if (!pre || !isUsable(pre, now)) throw invalid();

  // Senha validada e com hash ANTES da transação (Argon2 é lento) e antes de
  // gastar o convite: senha fraca não consome o link.
  let credentials: Credentials | null = null;
  if ("password" in input) {
    // Convite de proprietário só pede a senha (o dono já tem nome).
    const parsed =
      pre.role === "owner"
        ? ownerCredentialsSchema.safeParse({ password: input.password })
        : teamCredentialsSchema.safeParse({ name: input.name, password: input.password });
    if (!parsed.success) {
      const fieldErrors = toFieldErrors(parsed.error);
      throw new TeamError(
        "validation",
        Object.values(fieldErrors)[0] ?? "Confira os dados informados.",
        fieldErrors,
      );
    }
    credentials = {
      name: (parsed.data as { name?: string }).name ?? "",
      passwordHash: await hashPassword(parsed.data.password),
    };
  }

  return db.transaction(async (tx) => {
    const [inv] = await tx
      .select()
      .from(invitations)
      .where(eq(invitations.tokenHash, hashToken(token)))
      .for("update");
    if (!inv || !isUsable(inv, now)) throw invalid();

    const userId = await resolveUser(tx, inv, input, credentials, now);

    if (inv.role === "staff") {
      if (!inv.professionalId) throw invalid();
      const professionalId = inv.professionalId;
      const linked = await withTenantTx(tx, inv.tenantId, (t) =>
        t
          .update(professionals)
          .set({ userId })
          .where(
            and(
              eq(professionals.tenantId, inv.tenantId),
              eq(professionals.id, professionalId),
              eq(professionals.active, true),
              isNull(professionals.userId),
            ),
          )
          .returning({ id: professionals.id }),
      );
      if (linked.length === 0) throw invalid();
    }

    if (inv.role !== "owner") {
      await tx.insert(memberships).values({ userId, tenantId: inv.tenantId, role: inv.role });
    }

    await withTenantTx(tx, inv.tenantId, (t) =>
      t
        .update(invitations)
        .set({ acceptedAt: now })
        .where(and(eq(invitations.tenantId, inv.tenantId), eq(invitations.id, inv.id))),
    );

    return { userId, tenantId: inv.tenantId };
  });
}

/** Descobre (ou cria) o usuário que aceita, aplicando as regras de cada forma de aceite. */
async function resolveUser(
  tx: Db,
  inv: InvitationRow,
  input: AcceptInput,
  credentials: Credentials | null,
  now: Date,
): Promise<string> {
  const isOwnerInvite = inv.role === "owner";

  // --- nome + senha ---
  if (credentials) {
    if (isOwnerInvite) {
      const owner = await ownerOf(tx, inv.tenantId);
      if (!owner || owner.email !== inv.email) throw invalid();
      // O link chegou ao e-mail do dono: vale como redefinição de senha.
      await lockUserForInvite(tx, owner.id, inv);
      await tx
        .update(users)
        .set({ passwordHash: credentials.passwordHash, emailVerifiedAt: owner.emailVerifiedAt ?? now })
        .where(eq(users.id, owner.id));
      await tx.delete(sessions).where(eq(sessions.userId, owner.id));
      await revokeUnusedEmailTokens(tx, owner.id, "reset");
      await revokeUnusedEmailTokens(tx, owner.id, "verify");
      return owner.id;
    }
    const created = await tx
      .insert(users)
      .values({
        email: inv.email,
        name: credentials.name,
        passwordHash: credentials.passwordHash,
        emailVerifiedAt: now,
      })
      .onConflictDoNothing({ target: users.email })
      .returning({ id: users.id });
    // E-mail que já tem conta: o link não dá o direito de trocar a senha dela.
    if (created.length === 0) throw wrongAccount(inv.email);
    return created[0].id;
  }

  // --- Google ---
  if ("googleProfile" in input) {
    const profile = input.googleProfile;
    if (normalizeEmail(profile.email) !== inv.email) throw wrongAccount(inv.email);
    if (!profile.emailVerified) throw new TeamError("google_failed");

    const resolved = await resolveGoogleUser(tx, profile, now);
    if (resolved.kind === "error") throw new TeamError("google_failed");

    if (resolved.kind === "new") {
      // Convite de proprietário é do dono que já existe: Google de outro e-mail não cria conta.
      if (isOwnerInvite) throw wrongAccount(inv.email);
      const created = await tx
        .insert(users)
        .values({ email: inv.email, name: profile.name, passwordHash: null, emailVerifiedAt: now })
        .onConflictDoNothing({ target: users.email })
        .returning({ id: users.id });
      if (created.length === 0) throw wrongAccount(inv.email);
      await tx.insert(oauthAccounts).values({
        provider: GOOGLE_PROVIDER,
        providerUserId: profile.sub,
        userId: created[0].id,
        email: inv.email,
      });
      return created[0].id;
    }

    // Conta existente (já vinculada ou vinculada agora, com o descarte de
    // senha de conta nunca confirmada feito por `resolveGoogleUser`).
    await lockUserForInvite(tx, resolved.userId, inv);
    await checkExistingUser(tx, inv, resolved.userId);
    return resolved.userId;
  }

  // --- usuário da sessão ---
  if (!("userId" in input)) throw invalid();
  const user = await lockUserForInvite(tx, input.userId, inv);
  await checkExistingUser(tx, inv, user.id);
  // O link chegou ao e-mail do convite: prova a posse. Conta com e-mail nunca
  // confirmado pode ter senha definida por outra pessoa (pré-sequestro):
  // descarta senha, sessões e links, como no vínculo com o Google.
  if (user.emailVerifiedAt === null) await discardUnverifiedCredentials(tx, user.id, now);
  return user.id;
}

/** Convite de proprietário: só o dono do estabelecimento; demais: sem vínculo anterior. */
async function checkExistingUser(tx: Db, inv: InvitationRow, userId: string): Promise<void> {
  if (inv.role === "owner") {
    const owner = await ownerOf(tx, inv.tenantId);
    if (!owner || owner.id !== userId) throw wrongAccount(inv.email);
    return;
  }
  await assertNoMembership(tx, userId, inv.tenantId);
}
