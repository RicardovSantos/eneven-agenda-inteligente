import type { Metadata } from "next";
import { BrandForm } from "@/components/settings/brand-form";
import { BusinessInfoForm } from "@/components/settings/business-info-form";
import { SettingsPageShell } from "@/components/settings/settings-nav";
import { requirePanelRole } from "@/server/panel/roles";
import { loadTenant } from "../tenant";

export const metadata: Metadata = { title: "Dados e marca" };

export default async function EstabelecimentoPage() {
  const { session } = await requirePanelRole(["owner"]);
  const { tenant } = await loadTenant(session.tenantId);
  return (
    <SettingsPageShell title="Dados e marca" description="Nome, contato, redes sociais, logo e cor do seu estabelecimento.">
      <BusinessInfoForm
        initial={{
          name: tenant.name,
          whatsapp: tenant.whatsapp ?? "",
          address: tenant.address ?? "",
          instagram: tenant.instagram ?? "",
          facebook: tenant.facebook ?? "",
          about: tenant.about ?? "",
        }}
      />
      <BrandForm initial={{ name: tenant.name, logoUrl: tenant.logoUrl, color: tenant.brandColor ?? "#3E07D2" }} />
    </SettingsPageShell>
  );
}
