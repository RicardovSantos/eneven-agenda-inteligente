import { eq } from "drizzle-orm";
import { auditLog, tenants } from "@/db/schema";
import type { Db } from "@/db/types";
import { createOwnerAccessInvite } from "@/server/team/invitations";
import type { AdminActor } from "./actions";
import { UUID, tenantNotFound } from "./errors";

/**
 * Envia ao dono o convite para criar a senha e registra na auditoria (quem,
 * qual estabelecimento e se o e-mail saiu). O token nunca passa por aqui.
 */
export async function sendOwnerAccessInvite(
  db: Db,
  actor: AdminActor,
  tenantId: string,
  now: Date = new Date(),
): Promise<{ emailSent: boolean }> {
  if (!UUID.test(tenantId)) throw tenantNotFound();
  const [tenant] = await db.select({ id: tenants.id }).from(tenants).where(eq(tenants.id, tenantId)).limit(1);
  if (!tenant) throw tenantNotFound();

  const { emailSent } = await createOwnerAccessInvite(db, tenantId, actor.userId, now);
  await db.insert(auditLog).values({
    actorUserId: actor.userId,
    tenantId,
    action: "tenant.owner_invite_sent",
    details: { emailSent },
  });
  return { emailSent };
}
