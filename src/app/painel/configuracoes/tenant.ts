import { eq } from "drizzle-orm";
import { redirect } from "next/navigation";
import { getDb } from "@/db/client";
import { tenants } from "@/db/schema";
import { requirePanelRole } from "@/server/panel/roles";

/** Sessão do proprietário e o estabelecimento dele, para as telas de configuração. */
export async function loadOwnerTenant() {
  const { session } = await requirePanelRole(["owner"]);
  const db = await getDb();
  const [tenant] = await db.select().from(tenants).where(eq(tenants.id, session.tenantId)).limit(1);
  if (!tenant) redirect("/entrar");
  return { session, db, tenant };
}
