import { cache } from "react";
import { and, eq } from "drizzle-orm";
import { redirect } from "next/navigation";
import { getDb } from "@/db/client";
import { memberships, tenants, users } from "@/db/schema";
import { requireTenantSession } from "@/server/auth/guard";

/**
 * Dados da casca do painel (usuário e estabelecimento da sessão). Uma consulta
 * por requisição, compartilhada entre layout e página.
 */
export const getPanelData = cache(async () => {
  const session = await requireTenantSession();
  const db = await getDb();

  const [row] = await db
    .select({
      userName: users.name,
      userEmail: users.email,
      tenantName: tenants.name,
      tenantSlug: tenants.slug,
      tenantStatus: tenants.status,
      trialEndsAt: tenants.trialEndsAt,
      timezone: tenants.timezone,
    })
    .from(memberships)
    .innerJoin(users, eq(users.id, memberships.userId))
    .innerJoin(tenants, eq(tenants.id, memberships.tenantId))
    .where(
      and(
        eq(memberships.userId, session.userId),
        eq(memberships.tenantId, session.tenantId),
      ),
    )
    .limit(1);

  if (!row) redirect("/entrar");
  return { session, ...row };
});
