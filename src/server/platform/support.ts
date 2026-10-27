import { and, eq } from "drizzle-orm";
import { auditLog, sessions, tenants, users } from "@/db/schema";
import type { Db } from "@/db/types";
import { resolveLoginTenantId } from "@/server/auth/login";
import { hashToken } from "@/server/auth/session";
import type { AdminActor } from "./actions";
import { PlatformError, UUID, tenantNotFound } from "./errors";

const MIN_MS = 60_000;

/**
 * Modo suporte ("entrar como"): troca o estabelecimento da PRÓPRIA sessão do
 * super-admin. O papel `owner` não vem de vínculo: `getSession` o concede
 * enquanto `support_started_at` estiver preenchido e o usuário for super-admin.
 * A linha da sessão tem de ser do ator (token + `user_id`), senão nada muda.
 */
export async function startSupport(
  db: Db,
  sessionToken: string,
  actor: AdminActor,
  tenantId: string,
  now: Date = new Date(),
): Promise<void> {
  await db.transaction(async (tx) => {
    const [user] = await tx
      .select({ isSuperAdmin: users.isSuperAdmin })
      .from(users)
      .where(eq(users.id, actor.userId))
      .limit(1);
    if (!user?.isSuperAdmin) {
      throw new PlatformError("forbidden", "Você não tem permissão para fazer isso.");
    }
    if (!UUID.test(tenantId)) throw tenantNotFound();
    const [tenant] = await tx
      .select({ id: tenants.id })
      .from(tenants)
      .where(eq(tenants.id, tenantId))
      .limit(1);
    if (!tenant) throw tenantNotFound();

    const updated = await tx
      .update(sessions)
      .set({ tenantId, supportStartedAt: now })
      .where(and(eq(sessions.id, hashToken(sessionToken)), eq(sessions.userId, actor.userId)))
      .returning({ id: sessions.id });
    if (updated.length === 0) {
      throw new PlatformError("forbidden", "Sessão inválida.");
    }
    await tx.insert(auditLog).values({
      actorUserId: actor.userId,
      tenantId,
      action: "support.started",
      details: {},
    });
  });
}

/**
 * Sai do modo suporte: a sessão volta para o estabelecimento do próprio
 * usuário (ou nenhum, e a tela leva a /admin) e `support_started_at` é limpo.
 * A auditoria vai no estabelecimento que estava sendo atendido.
 */
export async function endSupport(
  db: Db,
  sessionToken: string,
  actor: AdminActor,
  now: Date = new Date(),
): Promise<void> {
  await db.transaction(async (tx) => {
    const id = hashToken(sessionToken);
    const [row] = await tx
      .select({
        tenantId: sessions.tenantId,
        supportStartedAt: sessions.supportStartedAt,
      })
      .from(sessions)
      .where(and(eq(sessions.id, id), eq(sessions.userId, actor.userId)))
      .limit(1);
    if (!row) throw new PlatformError("forbidden", "Sessão inválida.");
    if (row.supportStartedAt === null) {
      throw new PlatformError("invalid_state", "Você não está no modo suporte.");
    }
    const homeTenantId = await resolveLoginTenantId(tx, actor.userId);
    await tx
      .update(sessions)
      .set({ tenantId: homeTenantId, supportStartedAt: null })
      .where(and(eq(sessions.id, id), eq(sessions.userId, actor.userId)));
    await tx.insert(auditLog).values({
      actorUserId: actor.userId,
      tenantId: row.tenantId,
      action: "support.ended",
      details: { minutes: Math.round((now.getTime() - row.supportStartedAt.getTime()) / MIN_MS) },
    });
  });
}
