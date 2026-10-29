import { and, asc, eq, isNull, ne } from "drizzle-orm";
import { invitations, memberships, professionals, sessions, users } from "@/db/schema";
import type { Db } from "@/db/types";
import { withTenant, withTenantTx } from "@/server/tenant-db";
import { TeamError, UUID } from "./errors";
import type { TeamActor } from "./invitations";

export type MemberRow =
  | {
      kind: "member";
      userId: string;
      name: string;
      email: string;
      role: "owner" | "reception" | "staff";
      professionalName: string | null;
    }
  | {
      kind: "invite";
      invitationId: string;
      name: string;
      email: string;
      role: "reception" | "staff";
      professionalName: string | null;
      sentAt: Date;
      expired: boolean;
    };

const ROLE_RANK = { owner: 0, reception: 1, staff: 2 } as const;

/**
 * Quem tem acesso e quem foi convidado: proprietário primeiro, depois os
 * membros (recepção, profissionais; por nome) e por fim os convites pendentes
 * não revogados (convites de proprietário, feitos pela plataforma, não entram).
 */
export async function listTeamAccess(
  db: Db,
  tenantId: string,
  now: Date = new Date(),
): Promise<MemberRow[]> {
  const memberRows = await db
    .select({
      userId: users.id,
      name: users.name,
      email: users.email,
      role: memberships.role,
    })
    .from(memberships)
    .innerJoin(users, eq(users.id, memberships.userId))
    .where(eq(memberships.tenantId, tenantId));

  const { pros, invites } = await withTenant(db, tenantId, async (tx) => ({
    pros: await tx
      .select({ id: professionals.id, name: professionals.name, userId: professionals.userId })
      .from(professionals)
      .where(eq(professionals.tenantId, tenantId)),
    invites: await tx
      .select()
      .from(invitations)
      .where(
        and(
          eq(invitations.tenantId, tenantId),
          isNull(invitations.acceptedAt),
          isNull(invitations.revokedAt),
          ne(invitations.role, "owner"),
        ),
      )
      .orderBy(asc(invitations.sentAt), asc(invitations.id)),
  }));

  const proByUser = new Map(pros.filter((p) => p.userId).map((p) => [p.userId as string, p.name]));
  const proById = new Map(pros.map((p) => [p.id, p.name]));

  const members: MemberRow[] = memberRows
    .sort(
      (a, b) =>
        ROLE_RANK[a.role] - ROLE_RANK[b.role] ||
        a.name.localeCompare(b.name, "pt-BR") ||
        a.email.localeCompare(b.email),
    )
    .map((m) => ({
      kind: "member",
      userId: m.userId,
      name: m.name,
      email: m.email,
      role: m.role,
      professionalName: m.role === "staff" ? (proByUser.get(m.userId) ?? null) : null,
    }));

  const pending: MemberRow[] = invites
    .filter((i): i is typeof i & { role: "reception" | "staff" } => i.role !== "owner")
    .map((i) => ({
      kind: "invite",
      invitationId: i.id,
      name: i.name,
      email: i.email,
      role: i.role,
      professionalName: i.professionalId ? (proById.get(i.professionalId) ?? null) : null,
      sentAt: i.sentAt,
      expired: i.expiresAt.getTime() <= now.getTime(),
    }));

  return [...members, ...pending];
}

/**
 * Tira o acesso de um membro (só o proprietário): apaga o vínculo e as sessões
 * dele neste estabelecimento e solta `professionals.user_id` dos profissionais
 * daqui. A conta (usuário) continua existindo. O proprietário não pode ser
 * removido.
 */
export async function removeMember(db: Db, actor: TeamActor, userId: string): Promise<void> {
  if (actor.role !== "owner") throw new TeamError("forbidden");
  if (!UUID.test(userId)) throw new TeamError("not_found");

  await db.transaction(async (tx) => {
    const [member] = await tx
      .select({ role: memberships.role })
      .from(memberships)
      .where(and(eq(memberships.userId, userId), eq(memberships.tenantId, actor.tenantId)))
      .for("update");
    if (!member) throw new TeamError("not_found");
    if (member.role === "owner") throw new TeamError("forbidden");

    await tx
      .delete(memberships)
      .where(and(eq(memberships.userId, userId), eq(memberships.tenantId, actor.tenantId)));
    await tx
      .delete(sessions)
      .where(and(eq(sessions.userId, userId), eq(sessions.tenantId, actor.tenantId)));
    await withTenantTx(tx, actor.tenantId, (t) =>
      t
        .update(professionals)
        .set({ userId: null })
        .where(and(eq(professionals.tenantId, actor.tenantId), eq(professionals.userId, userId))),
    );
  });
}

/** Profissionais ativos, deste estabelecimento, que ainda não têm acesso (opções do convite "Profissional"). */
export async function listInvitableProfessionals(
  db: Db,
  tenantId: string,
): Promise<{ id: string; name: string }[]> {
  return withTenant(db, tenantId, (tx) =>
    tx
      .select({ id: professionals.id, name: professionals.name })
      .from(professionals)
      .where(
        and(
          eq(professionals.tenantId, tenantId),
          eq(professionals.active, true),
          isNull(professionals.userId),
        ),
      )
      .orderBy(asc(professionals.sortOrder), asc(professionals.createdAt), asc(professionals.id)),
  );
}

/** Ids dos profissionais ligados a um usuário (o "Tem acesso" da tela Equipe). */
export async function professionalIdsWithAccess(db: Db, tenantId: string): Promise<Set<string>> {
  const rows = await withTenant(db, tenantId, (tx) =>
    tx
      .select({ id: professionals.id, userId: professionals.userId })
      .from(professionals)
      .where(eq(professionals.tenantId, tenantId)),
  );
  return new Set(rows.filter((r) => r.userId !== null).map((r) => r.id));
}
