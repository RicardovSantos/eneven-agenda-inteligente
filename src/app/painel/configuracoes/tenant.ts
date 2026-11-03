import { eq } from "drizzle-orm";
import { redirect } from "next/navigation";
import { getDb } from "@/db/client";
import { tenants } from "@/db/schema";

/**
 * O estabelecimento do proprietário, para as telas de configuração. Cada `page.tsx`
 * chama `requirePanelRole(["owner"])` antes, por escrito (uma guarda de teste confere isso).
 */
export async function loadTenant(tenantId: string) {
  const db = await getDb();
  const [tenant] = await db.select().from(tenants).where(eq(tenants.id, tenantId)).limit(1);
  if (!tenant) redirect("/entrar");
  return { db, tenant };
}
