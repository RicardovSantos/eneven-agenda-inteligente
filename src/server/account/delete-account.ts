import { and, eq, inArray, notExists, sql } from "drizzle-orm";
import { auditLog, memberships, tenants, users } from "@/db/schema";
import type { Db } from "@/db/types";
import { verifyPassword } from "@/server/auth/password";
import type { TenantTx } from "@/server/tenant-db";
import { archiveTenantBilling } from "./archive-billing";
import { AccountDeletionError, DELETE_CONFIRMATION_WORD } from "./errors";

export type DeleteAccountInput = {
  userId: string;
  tenantId: string;
  /** O que a pessoa digitou no campo de confirmação (precisa ser "EXCLUIR"). */
  confirmation: string;
  /** Senha atual; obrigatória para contas com senha (contas só do Google não têm). */
  password: string;
};

export type DeleteAccountDeps = {
  /**
   * Encerra a cobrança recorrente do estabelecimento nos provedores de pagamento antes de qualquer
   * exclusão. Se lançar, nada é apagado. Só é chamada para o proprietário.
   */
  cancelBilling: (input: { tenantId: string; ownerUserId: string }) => Promise<void>;
  /** Retira o acesso ao Google Agenda (proprietário: de todas as conexões do estabelecimento; equipe: só a da pessoa). Falha não impede a exclusão. */
  revokeCalendar?: (input: { tenantId: string; userId?: string }) => Promise<unknown>;
};

export type DeleteAccountResult = {
  /** `owner`: o estabelecimento inteiro foi apagado; `member`: só a conta desta pessoa. */
  scope: "owner" | "member";
  userDeleted: boolean;
};

const MESSAGES = {
  confirmation: `Digite ${DELETE_CONFIRMATION_WORD} para confirmar.`,
  password: "Senha incorreta.",
  forbidden: "Não foi possível excluir esta conta.",
  super_admin: "Contas da administração da plataforma não podem ser excluídas por aqui. Fale com a Eneven.",
  not_found: "Conta não encontrada.",
} as const;

/**
 * Exclui a conta de quem está logado. Proprietário: apaga o estabelecimento inteiro (clientes,
 * agenda, equipe, página pública, cobranças) e as contas da equipe que só existiam nele. Recepção ou
 * profissional: apaga só a própria conta (o nome na equipe e o histórico do estabelecimento ficam
 * com ele, sem ligação com a conta). Contas com acesso a outro estabelecimento perdem só o acesso a este.
 *
 * Ordem: confere a pessoa -> encerra a cobrança nos provedores -> apaga no banco (uma transação).
 * Uma falha na cobrança não apaga nada; os registros dos provedores de pagamento (Mercado Pago e
 * Stripe) seguem as regras deles.
 */
export async function deleteAccount(
  db: Db,
  input: DeleteAccountInput,
  deps: DeleteAccountDeps,
): Promise<DeleteAccountResult> {
  if (input.confirmation.trim().toUpperCase() !== DELETE_CONFIRMATION_WORD) {
    throw new AccountDeletionError("confirmation", MESSAGES.confirmation);
  }

  const [row] = await db
    .select({
      passwordHash: users.passwordHash,
      isSuperAdmin: users.isSuperAdmin,
      role: memberships.role,
    })
    .from(users)
    .leftJoin(memberships, and(eq(memberships.userId, users.id), eq(memberships.tenantId, input.tenantId)))
    .where(eq(users.id, input.userId))
    .limit(1);
  if (!row) throw new AccountDeletionError("not_found", MESSAGES.not_found);
  if (row.isSuperAdmin) throw new AccountDeletionError("super_admin", MESSAGES.super_admin);
  if (!row.role) throw new AccountDeletionError("forbidden", MESSAGES.forbidden);

  if (row.passwordHash !== null && !(await verifyPassword(row.passwordHash, input.password))) {
    throw new AccountDeletionError("password", MESSAGES.password);
  }

  if (row.role === "owner") {
    try {
      await deps.cancelBilling({ tenantId: input.tenantId, ownerUserId: input.userId });
    } catch (error) {
      console.error("Falha ao encerrar a cobrança antes de excluir a conta", error);
      throw new AccountDeletionError(
        "billing",
        "Não foi possível encerrar a cobrança agora. Nada foi apagado. Tente novamente em instantes ou fale com o suporte.",
      );
    }
    await revokeCalendarBestEffort(deps, { tenantId: input.tenantId });
    return deleteTenantAccount(db, input.tenantId, input.userId);
  }
  await revokeCalendarBestEffort(deps, { tenantId: input.tenantId, userId: input.userId });
  return deleteMemberAccount(db, input.tenantId, input.userId, row.role);
}

async function revokeCalendarBestEffort(deps: DeleteAccountDeps, input: { tenantId: string; userId?: string }): Promise<void> {
  try {
    await deps.revokeCalendar?.(input);
  } catch (error) {
    console.warn("Falha ao retirar o acesso ao Google Agenda antes de excluir a conta", error instanceof Error ? error.message : "erro");
  }
}

/** Apaga as contas que não têm mais nenhum estabelecimento (e não são da administração). */
async function deleteOrphanUsers(tx: TenantTx, userIds: string[]): Promise<string[]> {
  if (userIds.length === 0) return [];
  const removed = await tx
    .delete(users)
    .where(
      and(
        inArray(users.id, userIds),
        eq(users.isSuperAdmin, false),
        notExists(tx.select({ one: sql`1` }).from(memberships).where(eq(memberships.userId, users.id))),
      ),
    )
    .returning({ id: users.id });
  return removed.map((user) => user.id);
}

async function deleteTenantAccount(db: Db, tenantId: string, ownerUserId: string): Promise<DeleteAccountResult> {
  return db.transaction(async (tx) => {
    const members = await tx.select({ userId: memberships.userId }).from(memberships).where(eq(memberships.tenantId, tenantId));
    // Antes de apagar, guarda só os identificadores e valores da cobrança, sem dados pessoais.
    const archived = await archiveTenantBilling(tx, tenantId);
    // Os dados do estabelecimento saem em cascata (clientes, agenda, equipe, fotos, cobranças, avisos...).
    const removed = await tx.delete(tenants).where(eq(tenants.id, tenantId)).returning({ id: tenants.id });
    if (removed.length === 0) throw new AccountDeletionError("not_found", MESSAGES.not_found);
    const deletedUsers = await deleteOrphanUsers(tx, members.map((member) => member.userId));
    // A auditoria guarda só identificadores, nunca nome, e-mail nem dados de clientes.
    await tx.insert(auditLog).values({
      actorUserId: null,
      tenantId: null,
      action: "account.deleted",
      details: { scope: "owner", tenantId, members: members.length, usersDeleted: deletedUsers.length, billingRecords: archived },
    });
    return { scope: "owner" as const, userDeleted: deletedUsers.includes(ownerUserId) };
  });
}

async function deleteMemberAccount(db: Db, tenantId: string, userId: string, role: "reception" | "staff"): Promise<DeleteAccountResult> {
  return db.transaction(async (tx) => {
    await tx.delete(memberships).where(and(eq(memberships.tenantId, tenantId), eq(memberships.userId, userId)));
    const deletedUsers = await deleteOrphanUsers(tx, [userId]);
    await tx.insert(auditLog).values({
      actorUserId: null,
      tenantId,
      action: "account.deleted",
      details: { scope: "member", role, userDeleted: deletedUsers.length > 0 },
    });
    return { scope: "member" as const, userDeleted: deletedUsers.length > 0 };
  });
}
