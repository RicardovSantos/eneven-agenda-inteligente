import { eq } from "drizzle-orm";
import { getDb } from "@/db/client";
import { tenants } from "@/db/schema";
import { getProfessionalPhoto } from "@/server/media";
import { imageResponse } from "@/server/media/response";
import { isUuid } from "@/server/catalog/services";

export const dynamic = "force-dynamic";

/** Foto do profissional (WebP), pelo slug do estabelecimento e pelo id dele. */
export async function GET(
  _request: Request,
  ctx: RouteContext<"/api/midia/[slug]/profissional/[id]">,
): Promise<Response> {
  const { slug, id } = await ctx.params;
  const db = await getDb();
  const [tenant] = await db
    .select({ id: tenants.id })
    .from(tenants)
    .where(eq(tenants.slug, slug))
    .limit(1);
  const photo = tenant && isUuid(id) ? await getProfessionalPhoto(db, tenant.id, id) : null;
  return imageResponse(photo);
}
