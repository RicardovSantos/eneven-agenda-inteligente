import type { Metadata } from "next";
import { PublicPageForm } from "@/components/settings/public-page-form";
import { SettingsPageShell } from "@/components/settings/settings-nav";
import { SlugForm } from "@/components/settings/slug-form";
import { heroPhotoUrl, listHeroPhotos } from "@/server/media";
import { loadOwnerTenant } from "../tenant";

export const metadata: Metadata = { title: "Página de agendamento" };

export default async function PaginaPage() {
  const { db, tenant } = await loadOwnerTenant();
  const heroPhotos = await listHeroPhotos(db, tenant.id);
  return (
    <SettingsPageShell title="Página de agendamento" description="As fotos, os textos e o endereço (link) que seus clientes usam para agendar.">
      <PublicPageForm
        initial={{
          heroTitle: tenant.heroTitle ?? "",
          heroSubtitle: tenant.heroSubtitle ?? "",
          photos: [0, 1, 2].map((slot) => {
            const photo = heroPhotos.find((p) => p.slot === slot);
            return photo ? heroPhotoUrl(tenant.slug, slot, photo.updatedAt) : null;
          }),
        }}
      />
      <SlugForm currentSlug={tenant.slug} />
    </SettingsPageShell>
  );
}
