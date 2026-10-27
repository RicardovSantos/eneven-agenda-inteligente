import { RegisterSw } from "@/components/pwa/register-sw";
import { InstallHint } from "@/components/pwa/install-hint";
import { PanelShell } from "@/components/panel/panel-shell";
import { ToastProvider } from "@/components/ui/toast";
import { PUBLIC_HOST } from "@/lib/brand";
import { PWA_METADATA } from "@/lib/pwa-manifest";
import { getPanelData } from "@/server/panel/data";
import { isTenantReleased } from "@/server/tenants/release";

export const metadata = PWA_METADATA;

export default async function PainelLayout({
  children,
}: LayoutProps<"/painel">) {
  const { userName, tenantName, tenantSlug, tenantStatus, trialEndsAt, session, onboardingCompletedAt } =
    await getPanelData();

  // Enquanto o proprietário não conclui (ou pula) os primeiros passos, só a
  // tela do assistente existe, sem menu: as demais páginas redirecionam para
  // ela (`requireOnboarded`) e o menu só volta quando o assistente termina.
  if (session.role === "owner" && onboardingCompletedAt === null) {
    return (
      <ToastProvider>
        {children}
        <RegisterSw />
      </ToastProvider>
    );
  }

  const released = isTenantReleased({
    status: tenantStatus,
    trialEndsAt,
    emailVerified: session.emailVerified,
  });
  const label = `${PUBLIC_HOST}/${tenantSlug}`;

  return (
    <ToastProvider>
      <PanelShell
        userName={userName}
        tenantName={tenantName}
        publicLink={released ? { label, url: `https://${label}` } : null}
      >
        {children}
        <InstallHint />
        <RegisterSw />
      </PanelShell>
    </ToastProvider>
  );
}
