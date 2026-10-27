import { RegisterSw } from "@/components/pwa/register-sw";
import { InstallHint } from "@/components/pwa/install-hint";
import { PanelShell } from "@/components/panel/panel-shell";
import { ReadOnlyBanner } from "@/components/panel/read-only-banner";
import { SupportBanner } from "@/components/panel/support-banner";
import { ToastProvider } from "@/components/ui/toast";
import { PUBLIC_HOST } from "@/lib/brand";
import { PWA_METADATA } from "@/lib/pwa-manifest";
import { buildWhatsAppLink } from "@/lib/whatsapp";
import { getPanelData } from "@/server/panel/data";
import { isTenantActive, isTenantReleased } from "@/server/tenants/release";

export const metadata = PWA_METADATA;

export default async function PainelLayout({
  children,
}: LayoutProps<"/painel">) {
  const { userName, tenantName, tenantSlug, tenantStatus, trialEndsAt, session, onboardingCompletedAt } =
    await getPanelData();

  const supportBanner = session.support ? <SupportBanner tenantName={tenantName} /> : null;

  // Enquanto o proprietário não conclui (ou pula) os primeiros passos, só a
  // tela do assistente existe, sem menu: as demais páginas redirecionam para
  // ela (`requireOnboarded`) e o menu só volta quando o assistente termina.
  if (session.role === "owner" && onboardingCompletedAt === null) {
    return (
      <ToastProvider>
        {supportBanner}
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
  const readOnly = !isTenantActive({ status: tenantStatus, trialEndsAt });
  const supportPhone = process.env.SUPPORT_WHATSAPP?.trim();
  const whatsappUrl = supportPhone
    ? buildWhatsAppLink(supportPhone, `Olá! Preciso de ajuda com a agenda do ${tenantName}.`)
    : null;

  return (
    <ToastProvider>
      {supportBanner}
      <PanelShell
        userName={userName}
        tenantName={tenantName}
        publicLink={released ? { label, url: `https://${label}` } : null}
        role={session.role!}
        isSuperAdmin={session.isSuperAdmin}
        notice={readOnly ? <ReadOnlyBanner whatsappUrl={whatsappUrl} /> : null}
      >
        {children}
        <InstallHint />
        <RegisterSw />
      </PanelShell>
    </ToastProvider>
  );
}
