import type { Db } from "@/db/types";
import type { WeeklyHours } from "@/lib/weekly-hours";
import { heroPhotoUrl, listHeroPhotos } from "@/server/media";
import { getBusinessHours } from "@/server/settings/hours";
import type { PublicTenant } from "./tenant";

export type PublicProfile = {
  /** Endereços das imagens do carrossel, na ordem das posições. */
  heroImages: string[];
  /** Horário de funcionamento (segunda a domingo), para o bloco de informações. */
  week: WeeklyHours;
};

/** Conteúdo da página pública que vem além do catálogo: imagens do carrossel e funcionamento. */
export async function loadPublicProfile(
  db: Db,
  tenant: Pick<PublicTenant, "id" | "slug">,
): Promise<PublicProfile> {
  const [photos, week] = await Promise.all([
    listHeroPhotos(db, tenant.id),
    getBusinessHours(db, tenant.id),
  ]);
  return {
    heroImages: photos.map((p) => heroPhotoUrl(tenant.slug, p.slot, p.updatedAt)),
    week,
  };
}
