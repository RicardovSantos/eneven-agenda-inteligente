import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { AuthShell } from "@/components/auth/auth-shell";
import { SignupForm } from "@/components/auth/signup-form";
import { canAccessTenantPanel, getCurrentSession } from "@/server/auth/guard";

export const metadata: Metadata = { title: "Criar agenda" };

export default async function CadastroPage() {
  if (canAccessTenantPanel(await getCurrentSession())) redirect("/painel");

  return (
    <AuthShell tagline="Seus clientes agendam sozinhos pelo link. Você só acompanha o dia.">
      <SignupForm />
    </AuthShell>
  );
}
