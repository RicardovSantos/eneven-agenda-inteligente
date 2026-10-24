import { cache } from "react";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { getDb } from "@/db/client";
import { SESSION_COOKIE, getSession, type SessionInfo } from "./session";

/**
 * Pura: o painel de um estabelecimento exige sessão, `tenantId` e `role`
 * (vínculo ainda existente) não nulos.
 */
export function canAccessTenantPanel(
  session: SessionInfo | null,
): session is SessionInfo & { tenantId: string } {
  return (
    session !== null &&
    session.tenantId !== null &&
    session.role !== null
  );
}

/** Sessão da requisição atual (lida do cookie), ou `null`. Uma consulta por requisição. */
export const getCurrentSession = cache(
  async (): Promise<SessionInfo | null> => {
    const token = (await cookies()).get(SESSION_COOKIE)?.value;
    if (!token) return null;
    return getSession(await getDb(), token);
  },
);

/**
 * Garante uma sessão válida com acesso ao painel; senão redireciona para
 * `/entrar`. Chame no layout e nas páginas do painel (o layout sozinho não
 * protege dados de páginas renderizadas em paralelo).
 */
export async function requireTenantSession(): Promise<
  SessionInfo & { tenantId: string }
> {
  const session = await getCurrentSession();
  if (!canAccessTenantPanel(session)) redirect("/entrar");
  return session;
}
