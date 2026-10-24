import type { Metadata } from "next";
import { AuthMessage } from "@/components/auth/auth-message";
import { AuthShell } from "@/components/auth/auth-shell";
import { ResetPasswordForm } from "@/components/auth/reset-password-form";
import { getDb } from "@/db/client";
import { checkEmailToken } from "@/server/auth/email-tokens";

export const metadata: Metadata = {
  title: "Nova senha",
  robots: { index: false },
  // O link traz o token: não repassa a URL para outros sites.
  referrer: "no-referrer",
};

export default async function RedefinirSenhaPage({
  params,
}: PageProps<"/recuperar-senha/[token]">) {
  const { token } = await params;
  const check = await checkEmailToken(await getDb(), token, "reset");

  return (
    <AuthShell tagline="Sua agenda do dia, onde você estiver.">
      {check.ok ? (
        <ResetPasswordForm token={token} />
      ) : (
        <AuthMessage
          title="Link inválido ou vencido"
          text="Peça um novo link para redefinir sua senha."
          actionLabel="Pedir novo link"
          href="/recuperar-senha"
        />
      )}
    </AuthShell>
  );
}
