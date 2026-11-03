import type { Metadata } from "next";
import { SettingsPageShell } from "@/components/settings/settings-nav";
import { ThemeForm } from "@/components/settings/theme-form";
import { requirePanelRole } from "@/server/panel/roles";

export const metadata: Metadata = { title: "Aparência" };

export default async function AparenciaPage() {
  await requirePanelRole(["owner"]);
  return (
    <SettingsPageShell title="Aparência" description="Como o painel aparece neste aparelho.">
      <ThemeForm />
    </SettingsPageShell>
  );
}
