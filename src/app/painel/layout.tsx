import { InstallHint } from "@/components/pwa/install-hint";
import { PanelShell } from "@/components/panel/panel-shell";
import { ToastProvider } from "@/components/ui/toast";
import { getPanelData } from "@/server/panel/data";

export default async function PainelLayout({
  children,
}: LayoutProps<"/painel">) {
  const { userName, tenantName, session, onboardingCompletedAt } = await getPanelData();

  // Enquanto o proprietário não conclui (ou pula) os primeiros passos, só a
  // tela do assistente existe, sem menu: as demais páginas redirecionam para
  // ela (`requireOnboarded`) e o menu só volta quando o assistente termina.
  if (session.role === "owner" && onboardingCompletedAt === null) {
    return <ToastProvider>{children}</ToastProvider>;
  }

  return (
    <ToastProvider>
      <PanelShell userName={userName} tenantName={tenantName}>
        {children}
        <InstallHint />
      </PanelShell>
    </ToastProvider>
  );
}
