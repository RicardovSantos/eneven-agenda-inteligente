import { requireTenantSession } from "@/server/auth/guard";
import type { SessionInfo } from "@/server/auth/session";
import { CatalogError, FORBIDDEN_MESSAGE } from "./errors";

/**
 * Sessão do painel exigindo o papel `owner`. O `tenantId` vem sempre da
 * sessão. Recepção e profissional só leem: recebem `CatalogError("forbidden")`.
 */
export async function requireCatalogOwner(): Promise<
  SessionInfo & { tenantId: string; role: "owner" }
> {
  const session = await requireTenantSession();
  if (session.role !== "owner") throw new CatalogError("forbidden", FORBIDDEN_MESSAGE);
  return session as SessionInfo & { tenantId: string; role: "owner" };
}
