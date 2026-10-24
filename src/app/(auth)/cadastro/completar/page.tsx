import type { Metadata } from "next";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { AuthShell } from "@/components/auth/auth-shell";
import { CompleteGoogleForm } from "@/components/auth/complete-google-form";
import { GOOGLE_PENDING_COOKIE, parsePendingProfile } from "@/server/auth/google";
import { canAccessTenantPanel, getCurrentSession } from "@/server/auth/guard";

export const metadata: Metadata = { title: "Completar cadastro" };

export default async function CompletarCadastroPage() {
  if (canAccessTenantPanel(await getCurrentSession())) redirect("/painel");

  // Só chega aqui quem voltou do Google como conta nova; o cookie é assinado
  // e a Server Action o confere de novo antes de criar qualquer coisa.
  const profile = parsePendingProfile((await cookies()).get(GOOGLE_PENDING_COOKIE)?.value);
  if (!profile) redirect("/cadastro");

  return (
    <AuthShell tagline="Seus clientes agendam sozinhos pelo link. Você só acompanha o dia.">
      <CompleteGoogleForm email={profile.email} picture={profile.picture} />
    </AuthShell>
  );
}
