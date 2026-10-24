import type { Metadata } from "next";
import { AuthMessage } from "@/components/auth/auth-message";
import { AuthShell } from "@/components/auth/auth-shell";
import { getDb } from "@/db/client";
import { verifyEmail } from "@/server/auth/email-tokens";

export const metadata: Metadata = {
  title: "Confirmar e-mail",
  robots: { index: false },
  // O link traz o token: não repassa a URL para outros sites.
  referrer: "no-referrer",
};

const MESSAGES = {
  used: {
    title: "E-mail já confirmado",
    text: "Este link já foi usado. Entre na sua conta para continuar.",
  },
  expired: {
    title: "Link vencido",
    text: "Este link de confirmação venceu. Entre na sua conta e peça um novo pelo aviso no topo do painel.",
  },
  invalid: {
    title: "Link inválido",
    text: "Confira se copiou o link inteiro do e-mail.",
  },
} as const;

export default async function ConfirmarEmailPage({
  searchParams,
}: PageProps<"/confirmar-email">) {
  const { token } = await searchParams;
  const result = await verifyEmail(
    await getDb(),
    typeof token === "string" ? token : "",
  );

  return (
    <AuthShell tagline="Sua agenda do dia, onde você estiver.">
      {result.ok ? (
        <AuthMessage
          title="E-mail confirmado"
          text="Seu link de agendamento já pode ser usado."
          actionLabel="Ir para a agenda"
          href="/painel"
        />
      ) : (
        <AuthMessage {...MESSAGES[result.reason]} actionLabel="Entrar" href="/entrar" />
      )}
    </AuthShell>
  );
}
