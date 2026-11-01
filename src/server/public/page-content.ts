import type { PublicPageContent } from "@/components/booking/booking-flow";
import type { TeamMember } from "@/components/booking/team-section";
import type { Db } from "@/db/types";
import { weekRows } from "@/lib/week-rows";
import { professionalPhotoUrl } from "@/server/media";
import { loadPublicProfile } from "./profile";
import type { PublicCatalog, PublicProfessional, PublicTenant } from "./tenant";

/** Profissional como a página pública o mostra (com o endereço da foto, se houver). */
export function toTeamMember(slug: string, pro: PublicProfessional): TeamMember {
  return {
    id: pro.id,
    name: pro.name,
    title: pro.title,
    color: pro.color,
    photoUrl:
      pro.photoVersion === null
        ? null
        : professionalPhotoUrl(slug, pro.id, new Date(pro.photoVersion)),
  };
}

/** Tudo o que a página pública mostra além do catálogo de serviços. */
export async function loadPublicPageContent(
  db: Db,
  tenant: PublicTenant,
  catalog: PublicCatalog,
): Promise<PublicPageContent> {
  const profile = await loadPublicProfile(db, tenant);
  return {
    heroImages: profile.heroImages,
    heroTitle: tenant.heroTitle,
    heroSubtitle: tenant.heroSubtitle,
    team: catalog.professionals.map((pro) => toTeamMember(tenant.slug, pro)),
    weekRows: weekRows(profile.week),
    instagram: tenant.instagram,
    facebook: tenant.facebook,
  };
}
