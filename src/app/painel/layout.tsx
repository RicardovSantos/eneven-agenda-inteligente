import { PanelShell } from "@/components/panel/panel-shell";
import { getPanelData } from "@/server/panel/data";

export default async function PainelLayout({
  children,
}: LayoutProps<"/painel">) {
  const { userName, tenantName } = await getPanelData();
  return (
    <PanelShell userName={userName} tenantName={tenantName}>
      {children}
    </PanelShell>
  );
}
