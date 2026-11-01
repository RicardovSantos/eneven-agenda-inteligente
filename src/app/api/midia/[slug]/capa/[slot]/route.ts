import { eq } from "drizzle-orm";
import { getDb } from "@/db/client";
import { tenants } from "@/db/schema";
import { getHeroPhoto } from "@/server/media";
import { imageResponse } from "@/server/media/response";

export const dynamic = "force-dynamic";

/** Imagem do carrossel da página pública (WebP), pelo slug e pela posição de 0 a 2. */
export async function GET(
  _request: Request,
  ctx: RouteContext<"/api/midia/[slug]/capa/[slot]">,
): Promise<Response> {
  const { slug, slot } = await ctx.params;
  const db = await getDb();
  const [tenant] = await db
    .select({ id: tenants.id })
    .from(tenants)
    .where(eq(tenants.slug, slug))
    .limit(1);
  const photo = tenant && /^\d$/.test(slot) ? await getHeroPhoto(db, tenant.id, Number(slot)) : null;
  return imageResponse(photo);
}
