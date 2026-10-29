import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { AuthShell } from "@/components/auth/auth-shell";
import { LoginForm } from "@/components/auth/login-form";
import { GOOGLE_ERROR_MESSAGE, isGoogleConfigured } from "@/server/auth/google";
import { getCurrentSession, homePathFor } from "@/server/auth/guard";
import { getDb } from "@/db/client";
import { getInvitation } from "@/server/team/accept";

export const metadata: Metadata = { title: "Entrar" };

export default async function EntrarPage({ searchParams }: PageProps<"/entrar">) {
  const { senha, erro, convite } = await searchParams;

  // Vindo da página de um convite válido: entra com a conta do e-mail convidado
  // (mesmo com outra conta já aberta neste navegador) e o convite é aceito em seguida.
  const inviteToken = typeof convite === "string" ? convite : "";
  const invitation = inviteToken ? await getInvitation(await getDb(), inviteToken) : null;
  const invite = invitation?.status === "valid" ? invitation : null;

  const home = homePathFor(await getCurrentSession());
  if (home && !invite) redirect(home);

  const notice = invite
    ? `Entre com ${invite.email} para aceitar o convite de ${invite.tenantName}.`
    : senha === "redefinida"
      ? "Senha redefinida. Entre com a nova senha."
      : undefined;

  return (
    <AuthShell tagline="Sua agenda do dia, onde você estiver.">
      <LoginForm
        notice={notice}
        alert={erro === "google" ? GOOGLE_ERROR_MESSAGE : undefined}
        googleEnabled={isGoogleConfigured()}
        invite={invite ? { token: inviteToken, email: invite.email } : undefined}
      />
    </AuthShell>
  );
}
