import { InstallHint } from "@/components/pwa/install-hint";
import { PanelShell } from "@/components/panel/panel-shell";
import { ToastProvider } from "@/components/ui/toast";
import { getPanelData } from "@/server/panel/data";

export default async function PainelLayout({
  children,
}: LayoutProps<"/painel">) {
  const { userName, tenantName } = await getPanelData();
  return (
    <ToastProvider>
      <PanelShell userName={userName} tenantName={tenantName}>
        {children}
        <InstallHint />
      </PanelShell>
    </ToastProvider>
  );
}
