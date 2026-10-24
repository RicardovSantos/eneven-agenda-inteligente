import type { Metadata } from "next";
import { AuthShell } from "@/components/auth/auth-shell";
import { ForgotPasswordForm } from "@/components/auth/forgot-password-form";

export const metadata: Metadata = { title: "Recuperar senha" };

export default function RecuperarSenhaPage() {
  return (
    <AuthShell tagline="Sua agenda do dia, onde você estiver.">
      <ForgotPasswordForm />
    </AuthShell>
  );
}
