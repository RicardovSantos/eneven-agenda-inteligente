import { randomBytes } from "node:crypto";
import { and, eq, isNull } from "drizzle-orm";
import { z } from "zod";
import { invitations, memberships, professionals, tenants, users } from "@/db/schema";
import type { Db } from "@/db/types";
import { toFieldErrors } from "@/server/auth/schemas";
import { hashToken } from "@/server/auth/session";
import { buildInviteEmail, inviteLink } from "@/server/email/templates";
import { sendEmail } from "@/server/email/send";
import { limitInviteSend } from "@/server/security/limits";
import { withTenant } from "@/server/tenant-db";
import { TeamError } from "./errors";

export const INVITE_TTL_DAYS = 7;
const DAY_MS = 86_400_000;

/** Quem age: vem da sessão (nunca da entrada do usuário). */
export type TeamActor = {
  tenantId: string;
  userId: string;
  role: "owner" | "reception" | "staff";
};

export type InviteResult = {
  invitationId: string;
  /** Texto do link (só existe aqui e no e-mail; o banco guarda o hash). */
  token: string;
  /** `false` se o provedor de e-mail falhou: o convite existe, dá para reenviar. */
  emailSent: boolean;
};

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const inviteSchema = z.object({
  name: z
    .string()
    .trim()
    .min(1, "Informe o nome.")
    .max(120, "O nome pode ter no máximo 120 caracteres."),
  email: z
    .string()
    .trim()
    .toLowerCase()
    .pipe(z.email("Informe um e-mail válido.").max(254, "Informe um e-mail válido.")),
  role: z.enum(["reception", "staff"], { error: "Escolha o tipo de acesso." }),
  professionalId: z.string().optional(),
});

export type InviteInput = {
  name: string;
  email: string;
  role: "reception" | "staff";
  professionalId?: string;
};

function newToken(): { token: string; tokenHash: string } {
  const token = randomBytes(32).toString("base64url");
  return { token, tokenHash: hashToken(token) };
}

function requireOwner(actor: TeamActor): void {
  if (actor.role !== "owner") throw new TeamError("forbidden");
}

/** Envia o e-mail do convite (`sendEmail`: sem token configurado só vai para o console). */
export async function sendInviteEmail(
  invitation: { email: string; name: string; role: "owner" | "reception" | "staff"; tenantName: string },
  token: string,
): Promise<void> {
  const mail = buildInviteEmail({
    name: invitation.name,
    tenantName: invitation.tenantName,
    role: invitation.role,
    link: inviteLink(token),
  });
  await sendEmail({ to: invitation.email, subject: mail.subject, html: mail.html, text: mail.text });
}

/** Envia sem deixar a falha do provedor desfazer o convite já gravado. */
async function deliverWith(
  db: Db,
  invitation: { email: string; name: string; role: "owner" | "reception" | "staff" },
  tenantId: string,
  token: string,
): Promise<boolean> {
  try {
    const [tenant] = await db
      .select({ name: tenants.name })
      .from(tenants)
      .where(eq(tenants.id, tenantId))
      .limit(1);
    await sendInviteEmail({ ...invitation, tenantName: tenant?.name ?? "" }, token);
    return true;
  } catch (error) {
    console.error("Falha ao enviar o e-mail do convite", error);
    return false;
  }
}

/**
 * Convida recepção ou profissional (só o proprietário). `professionalId` só
 * vale para `staff` e precisa ser um profissional ativo, deste
 * estabelecimento, ainda sem usuário. Convite pendente para o mesmo e-mail é
 * revogado e substituído.
 */
export async function inviteMember(
  db: Db,
  actor: TeamActor,
  input: InviteInput,
  now: Date = new Date(),
): Promise<InviteResult> {
  requireOwner(actor);

  const parsed = inviteSchema.safeParse(input);
  const fieldErrors = parsed.success ? {} : toFieldErrors(parsed.error);
  const professionalId = parsed.success && parsed.data.role === "staff" ? parsed.data.professionalId : undefined;
  if (parsed.success && parsed.data.role === "staff" && (!professionalId || !UUID.test(professionalId))) {
    fieldErrors.professionalId = "Escolha o profissional.";
  }
  if (!parsed.success || Object.keys(fieldErrors).length > 0) {
    throw new TeamError(
      "validation",
      Object.values(fieldErrors)[0] ?? "Confira os dados informados.",
      fieldErrors,
    );
  }
  const data = parsed.data;

  const limited = limitInviteSend(actor.tenantId, now.getTime());
  if (!limited.ok) throw new TeamError("rate_limited");

  // E-mail que já tem usuário: um usuário pertence a um único estabelecimento.
  const [existing] = await db
    .select({ id: users.id })
    .from(users)
    .where(eq(users.email, data.email))
    .limit(1);
  if (existing) {
    const linked = await db
      .select({ tenantId: memberships.tenantId })
      .from(memberships)
      .where(eq(memberships.userId, existing.id));
    if (linked.some((m) => m.tenantId === actor.tenantId)) throw new TeamError("already_member");
    if (linked.length > 0) throw new TeamError("other_tenant");
  }

  const { token, tokenHash } = newToken();
  const invitationId = await withTenant(db, actor.tenantId, async (tx) => {
    if (data.role === "staff") {
      const [pro] = await tx
        .select({ id: professionals.id })
        .from(professionals)
        .where(
          and(
            eq(professionals.tenantId, actor.tenantId),
            eq(professionals.id, professionalId as string),
            eq(professionals.active, true),
            isNull(professionals.userId),
          ),
        )
        .limit(1);
      if (!pro) {
        const message = "Escolha um profissional ativo que ainda não tenha acesso.";
        throw new TeamError("validation", message, { professionalId: message });
      }
    }

    await tx
      .update(invitations)
      .set({ revokedAt: now })
      .where(
        and(
          eq(invitations.tenantId, actor.tenantId),
          eq(invitations.email, data.email),
          isNull(invitations.acceptedAt),
          isNull(invitations.revokedAt),
        ),
      );

    const [row] = await tx
      .insert(invitations)
      .values({
        tenantId: actor.tenantId,
        email: data.email,
        name: data.name,
        role: data.role,
        professionalId: data.role === "staff" ? professionalId : null,
        tokenHash,
        invitedByUserId: actor.userId,
        expiresAt: new Date(now.getTime() + INVITE_TTL_DAYS * DAY_MS),
        sentAt: now,
      })
      .returning({ id: invitations.id });
    return row.id;
  });

  const emailSent = await deliverWith(
    db,
    { email: data.email, name: data.name, role: data.role },
    actor.tenantId,
    token,
  );
  return { invitationId, token, emailSent };
}

/**
 * Convite de proprietário (usado pela plataforma): para o dono atual do
 * estabelecimento, que define a senha (ou vincula o Google) ao aceitar. Não
 * cria vínculo (ele já existe). A checagem de super-admin é de quem chama;
 * `invitedByUserId` é o super-admin.
 */
export async function createOwnerAccessInvite(
  db: Db,
  tenantId: string,
  invitedByUserId: string,
  now: Date = new Date(),
): Promise<InviteResult> {
  const [owner] = await db
    .select({ email: users.email, name: users.name })
    .from(memberships)
    .innerJoin(users, eq(users.id, memberships.userId))
    .where(and(eq(memberships.tenantId, tenantId), eq(memberships.role, "owner")))
    .limit(1);
  if (!owner) throw new TeamError("not_found");

  const { token, tokenHash } = newToken();
  const invitationId = await withTenant(db, tenantId, async (tx) => {
    await tx
      .update(invitations)
      .set({ revokedAt: now })
      .where(
        and(
          eq(invitations.tenantId, tenantId),
          eq(invitations.role, "owner"),
          isNull(invitations.acceptedAt),
          isNull(invitations.revokedAt),
        ),
      );
    const [row] = await tx
      .insert(invitations)
      .values({
        tenantId,
        email: owner.email,
        name: owner.name,
        role: "owner",
        professionalId: null,
        tokenHash,
        invitedByUserId,
        expiresAt: new Date(now.getTime() + INVITE_TTL_DAYS * DAY_MS),
        sentAt: now,
      })
      .returning({ id: invitations.id });
    return row.id;
  });

  const emailSent = await deliverWith(
    db,
    { email: owner.email, name: owner.name, role: "owner" },
    tenantId,
    token,
  );
  return { invitationId, token, emailSent };
}

/** Convite pendente (nem aceito, nem revogado) do estabelecimento do `actor`; convites de proprietário não são do painel. */
async function loadManageable(db: Db, actor: TeamActor, invitationId: string) {
  if (!UUID.test(invitationId)) throw new TeamError("not_found");
  const [row] = await withTenant(db, actor.tenantId, (tx) =>
    tx
      .select()
      .from(invitations)
      .where(
        and(
          eq(invitations.tenantId, actor.tenantId),
          eq(invitations.id, invitationId),
          isNull(invitations.acceptedAt),
          isNull(invitations.revokedAt),
        ),
      )
      .limit(1),
  );
  if (!row) throw new TeamError("not_found");
  if (row.role === "owner") throw new TeamError("forbidden");
  return row;
}

/** Novo token e nova validade; o link anterior deixa de valer. */
export async function resendInvitation(
  db: Db,
  actor: TeamActor,
  invitationId: string,
  now: Date = new Date(),
): Promise<InviteResult> {
  requireOwner(actor);
  const row = await loadManageable(db, actor, invitationId);

  const limited = limitInviteSend(actor.tenantId, now.getTime());
  if (!limited.ok) throw new TeamError("rate_limited");

  const { token, tokenHash } = newToken();
  const updated = await withTenant(db, actor.tenantId, (tx) =>
    tx
      .update(invitations)
      .set({
        tokenHash,
        sentAt: now,
        expiresAt: new Date(now.getTime() + INVITE_TTL_DAYS * DAY_MS),
      })
      .where(
        and(
          eq(invitations.tenantId, actor.tenantId),
          eq(invitations.id, row.id),
          isNull(invitations.acceptedAt),
          isNull(invitations.revokedAt),
        ),
      )
      .returning({ id: invitations.id }),
  );
  if (updated.length === 0) throw new TeamError("not_found");

  const emailSent = await deliverWith(
    db,
    { email: row.email, name: row.name, role: row.role },
    actor.tenantId,
    token,
  );
  return { invitationId: row.id, token, emailSent };
}

export async function revokeInvitation(
  db: Db,
  actor: TeamActor,
  invitationId: string,
  now: Date = new Date(),
): Promise<void> {
  requireOwner(actor);
  const row = await loadManageable(db, actor, invitationId);
  const revoked = await withTenant(db, actor.tenantId, (tx) =>
    tx
      .update(invitations)
      .set({ revokedAt: now })
      .where(
        and(
          eq(invitations.tenantId, actor.tenantId),
          eq(invitations.id, row.id),
          isNull(invitations.acceptedAt),
          isNull(invitations.revokedAt),
        ),
      )
      .returning({ id: invitations.id }),
  );
  if (revoked.length === 0) throw new TeamError("not_found");
}
