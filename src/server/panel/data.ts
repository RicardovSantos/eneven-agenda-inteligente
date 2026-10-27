import { cache } from "react";
import { eq } from "drizzle-orm";
import { redirect } from "next/navigation";
import { getDb } from "@/db/client";
import { tenants, users } from "@/db/schema";
import { requireTenantSession } from "@/server/auth/guard";

/**
 * Dados da casca do painel (usuário e estabelecimento da sessão). Uma consulta
 * por requisição, compartilhada entre layout e página. O vínculo já foi
 * conferido por `requireTenantSession` (`role` não nulo); no modo suporte o
 * super-admin não tem vínculo com o estabelecimento, então ele não entra na consulta.
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
      onboardingCompletedAt: tenants.onboardingCompletedAt,
    })
    .from(users)
    .innerJoin(tenants, eq(tenants.id, session.tenantId))
    .where(eq(users.id, session.userId))
    .limit(1);

  if (!row) redirect("/entrar");
  return { session, ...row };
});
