import type { Metadata } from "next";
import { SettingsPageShell } from "@/components/settings/settings-nav";
import { SettingsSection } from "@/components/settings/settings-section";
import { ExportDataButton } from "@/components/settings/export-data-button";
import { requirePanelRole } from "@/server/panel/roles";

export const metadata: Metadata = { title: "Seus dados" };

export default async function DadosPage() {
  const { session } = await requirePanelRole(["owner"]);
  return (
    <SettingsPageShell title="Seus dados" description="Leve uma cópia das informações do seu estabelecimento.">
      <SettingsSection id="dados" title="Baixar dados" description="Um arquivo com clientes, agendamentos, serviços, equipe e configurações. Guarde em lugar seguro: ele contém dados pessoais dos seus clientes.">
        {session.support ? (
          <p className="m-0 text-sm text-ink-muted">Indisponível no modo suporte.</p>
        ) : (
          <ExportDataButton />
        )}
      </SettingsSection>
    </SettingsPageShell>
  );
}
