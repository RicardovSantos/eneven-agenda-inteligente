import { cache } from "react";
import { and, eq } from "drizzle-orm";
import { redirect } from "next/navigation";
import { getDb } from "@/db/client";
import { memberships, tenants, users } from "@/db/schema";
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
      pastDueAt: tenants.pastDueAt,
      timezone: tenants.timezone,
      onboardingCompletedAt: tenants.onboardingCompletedAt,
    })
    .from(users)
    .innerJoin(tenants, eq(tenants.id, session.tenantId))
    .where(eq(users.id, session.userId))
    .limit(1);

  if (!row) redirect("/entrar");

  // A confirmação que libera o link é a do dono, inclusive para equipe e suporte.
  let linkEmailVerified = session.emailVerified;
  let verificationEmail = row.userEmail;
  if (session.support || session.role !== "owner") {
    const [owner] = await db
      .select({ email: users.email, emailVerifiedAt: users.emailVerifiedAt })
      .from(memberships)
      .innerJoin(users, eq(users.id, memberships.userId))
      .where(and(eq(memberships.tenantId, session.tenantId), eq(memberships.role, "owner")))
      .orderBy(users.createdAt)
      .limit(1);
    linkEmailVerified = owner?.emailVerifiedAt != null;
    verificationEmail = owner?.email ?? row.userEmail;
  }
  return { session, ...row, linkEmailVerified, verificationEmail };
});
