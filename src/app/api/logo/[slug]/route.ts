import { eq } from "drizzle-orm";
import { getDb } from "@/db/client";
import { tenants } from "@/db/schema";
import { getLogo } from "@/server/settings";

export const dynamic = "force-dynamic";

/**
 * Logo público do estabelecimento (usado na página de agendamento). Resolve
 * o tenant pelo slug (`tenants` é legível sem contexto de tenant) e lê o logo
 * pelo `withTenant`. Sem logo ou sem estabelecimento: 404.
 */
export async function GET(
  _request: Request,
  ctx: RouteContext<"/api/logo/[slug]">,
): Promise<Response> {
  const { slug } = await ctx.params;
  const db = await getDb();
  const [tenant] = await db
    .select({ id: tenants.id })
    .from(tenants)
    .where(eq(tenants.slug, slug))
    .limit(1);
  const logo = tenant ? await getLogo(db, tenant.id) : null;
  if (!logo) return new Response("Not found", { status: 404 });

  return new Response(new Uint8Array(logo.data), {
    headers: {
      "Content-Type": logo.mime,
      "Cache-Control": "public, max-age=300",
      "X-Content-Type-Options": "nosniff",
    },
  });
}
