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
import { withTenant, type TenantTx } from "@/server/tenant-db";
import { TeamError, UUID } from "./errors";

export const INVITE_TTL_DAYS = 7;
const DAY_MS = 86_400_000;

/** Quem age: vem da sessão (nunca da entrada do usuário). */
export type TeamActor = {
  tenantId: string;
  userId: string;
  role: "owner" | "reception" | "staff";
};

/**
 * Resultado público: SEM o token. Quem convida nunca recebe o link (senão
 * poderia aceitar o convite no lugar do convidado e ficar com uma conta
 * "verificada" para um e-mail que não é dele). O token só vai por e-mail.
 */
export type InviteResult = {
  invitationId: string;
  /** `false` se o provedor de e-mail falhou: o convite existe, dá para reenviar. */
  emailSent: boolean;
};

/** Só para testes e para a rota de seed do e2e: inclui o token. Nunca usar em código de app. */
export type InviteResultWithToken = InviteResult & { token: string };

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

/** Um usuário pertence a um único estabelecimento: e-mail com vínculo aqui ou em outro não é convidável. */
async function assertEmailAvailable(db: Db, tenantId: string, email: string): Promise<void> {
  const [existing] = await db
    .select({ id: users.id })
    .from(users)
    .where(eq(users.email, email))
    .limit(1);
  if (!existing) return;
  const linked = await db
    .select({ tenantId: memberships.tenantId })
    .from(memberships)
    .where(eq(memberships.userId, existing.id));
  if (linked.some((m) => m.tenantId === tenantId)) throw new TeamError("already_member");
  if (linked.length > 0) throw new TeamError("other_tenant");
}

const PROFESSIONAL_UNAVAILABLE = "Escolha um profissional ativo que ainda não tenha acesso.";

/** Profissional deste estabelecimento, ativo e ainda sem usuário (dentro de `withTenant`). */
async function assertProfessionalFree(
  tx: TenantTx,
  tenantId: string,
  professionalId: string,
): Promise<void> {
  const [pro] = await tx
    .select({ id: professionals.id })
    .from(professionals)
    .where(
      and(
        eq(professionals.tenantId, tenantId),
        eq(professionals.id, professionalId),
        eq(professionals.active, true),
        isNull(professionals.userId),
      ),
    )
    .limit(1);
  if (!pro) {
    throw new TeamError("validation", PROFESSIONAL_UNAVAILABLE, {
      professionalId: PROFESSIONAL_UNAVAILABLE,
    });
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
  const { invitationId, emailSent } = await inviteMemberForTests(db, actor, input, now);
  return { invitationId, emailSent };
}

/**
 * SOMENTE testes e e2e: igual a `inviteMember`, mas devolve o token. O código
 * de app deve usar `inviteMember` (o token só pode chegar ao convidado por e-mail).
 */
export async function inviteMemberForTests(
  db: Db,
  actor: TeamActor,
  input: InviteInput,
  now: Date = new Date(),
): Promise<InviteResultWithToken> {
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

  await assertEmailAvailable(db, actor.tenantId, data.email);

  const { token, tokenHash } = newToken();
  const invitationId = await withTenant(db, actor.tenantId, async (tx) => {
    if (data.role === "staff") {
      await assertProfessionalFree(tx, actor.tenantId, professionalId as string);
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
 * cria vínculo (ele já existe). Vale 7 dias; aceitar define a senha do dono
 * (como uma redefinição: derruba as sessões dele). A checagem de super-admin é de quem chama;
 * `invitedByUserId` é o super-admin.
 */
export async function createOwnerAccessInvite(
  db: Db,
  tenantId: string,
  invitedByUserId: string,
  now: Date = new Date(),
): Promise<InviteResult> {
  const { invitationId, emailSent } = await createOwnerAccessInviteForTests(
    db,
    tenantId,
    invitedByUserId,
    now,
  );
  return { invitationId, emailSent };
}

/** SOMENTE testes e e2e: igual a `createOwnerAccessInvite`, mas devolve o token. */
export async function createOwnerAccessInviteForTests(
  db: Db,
  tenantId: string,
  invitedByUserId: string,
  now: Date = new Date(),
): Promise<InviteResultWithToken> {
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
  const result = await resendInvitationForTests(db, actor, invitationId, now);
  return { invitationId: result.invitationId, emailSent: result.emailSent };
}

/** SOMENTE testes e e2e: igual a `resendInvitation`, mas devolve o novo token. */
export async function resendInvitationForTests(
  db: Db,
  actor: TeamActor,
  invitationId: string,
  now: Date = new Date(),
): Promise<InviteResultWithToken> {
  requireOwner(actor);
  const row = await loadManageable(db, actor, invitationId);

  // Mesmas regras de `inviteMember`: o cenário pode ter mudado desde o envio.
  await assertEmailAvailable(db, actor.tenantId, row.email);
  if (row.role === "staff") {
    const professionalId = row.professionalId;
    if (!professionalId) {
      throw new TeamError("validation", PROFESSIONAL_UNAVAILABLE, {
        professionalId: PROFESSIONAL_UNAVAILABLE,
      });
    }
    await withTenant(db, actor.tenantId, (tx) =>
      assertProfessionalFree(tx, actor.tenantId, professionalId),
    );
  }

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
