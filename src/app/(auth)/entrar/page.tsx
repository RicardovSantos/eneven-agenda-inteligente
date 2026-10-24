import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { AuthShell } from "@/components/auth/auth-shell";
import { LoginForm } from "@/components/auth/login-form";
import { canAccessTenantPanel, getCurrentSession } from "@/server/auth/guard";

export const metadata: Metadata = { title: "Entrar" };

export default async function EntrarPage() {
  if (canAccessTenantPanel(await getCurrentSession())) redirect("/painel");

  return (
    <AuthShell tagline="Sua agenda do dia, onde você estiver.">
      <LoginForm />
    </AuthShell>
  );
}
