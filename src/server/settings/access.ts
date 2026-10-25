import { requireTenantSession } from "@/server/auth/guard";
import type { SessionInfo } from "@/server/auth/session";
import { FORBIDDEN_MESSAGE, SettingsError } from "./errors";

/**
 * Sessão do painel exigindo o papel `owner`. O `tenantId` vem sempre da
 * sessão. Recepção e profissional recebem `SettingsError("forbidden")`.
 */
export async function requireOwner(): Promise<
  SessionInfo & { tenantId: string; role: "owner" }
> {
  const session = await requireTenantSession();
  if (session.role !== "owner") {
    throw new SettingsError("forbidden", FORBIDDEN_MESSAGE);
  }
  return session as SessionInfo & { tenantId: string; role: "owner" };
}
