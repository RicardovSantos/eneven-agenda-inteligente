import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { AuthShell } from "@/components/auth/auth-shell";
import { LoginForm } from "@/components/auth/login-form";
import { GOOGLE_ERROR_MESSAGE, isGoogleConfigured } from "@/server/auth/google";
import { canAccessTenantPanel, getCurrentSession } from "@/server/auth/guard";

export const metadata: Metadata = { title: "Entrar" };

export default async function EntrarPage({ searchParams }: PageProps<"/entrar">) {
  if (canAccessTenantPanel(await getCurrentSession())) redirect("/painel");

  const { senha, erro } = await searchParams;
  const notice =
    senha === "redefinida" ? "Senha redefinida. Entre com a nova senha." : undefined;

  return (
    <AuthShell tagline="Sua agenda do dia, onde você estiver.">
      <LoginForm
        notice={notice}
        alert={erro === "google" ? GOOGLE_ERROR_MESSAGE : undefined}
        googleEnabled={isGoogleConfigured()}
      />
    </AuthShell>
  );
}
