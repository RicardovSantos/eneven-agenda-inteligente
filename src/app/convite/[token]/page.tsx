import { eq } from "drizzle-orm";
import type { Metadata } from "next";
import Link from "next/link";
import { getDb } from "@/db/client";
import { users } from "@/db/schema";
import { AuthShell } from "@/components/auth/auth-shell";
import { FormAlert } from "@/components/auth/form-alert";
import { GoogleSection } from "@/components/auth/google-button";
import { buttonVariants } from "@/components/ui/button";
import { AcceptPasswordForm, AcceptSessionForm } from "@/components/invite/accept-invite-forms";
import { cn } from "@/lib/utils";
import { GOOGLE_ERROR_MESSAGE, isGoogleConfigured } from "@/server/auth/google";
import { getCurrentSession, homePathFor } from "@/server/auth/guard";
import { getInvitation } from "@/server/team/accept";
import { TeamError, wrongAccount } from "@/server/team/errors";

// O token está na URL: nada de cache, nada de indexação e nenhum referrer saindo desta página.
export const dynamic = "force-dynamic";
export const metadata: Metadata = {
  title: "Convite",
  robots: { index: false, follow: false },
  referrer: "no-referrer",
};

const TAGLINE = "Sua agenda do dia, onde você estiver.";
const ROLE_TEXT = { reception: "Recepção", staff: "Profissional" } as const;

/** Mensagem do `?erro=` que a volta do Google deixa na URL. */
function errorMessage(
  flag: string | undefined,
  email: string,
  isOwnerInvite: boolean,
): string | undefined {
  switch (flag) {
    case "conta":
      return isOwnerInvite ? `Use o e-mail ${email} para entrar.` : wrongAccount(email).message;
    case "invalido":
      return new TeamError("invalid_invitation").message;
    case "google":
      return GOOGLE_ERROR_MESSAGE;
    case "limite":
      return "Muitas tentativas. Tente de novo em alguns minutos.";
    case "membro":
      return new TeamError("already_member").message;
    case "outro":
      return new TeamError("other_tenant").message;
    default:
      return undefined;
  }
}

export default async function ConvitePage({
  params,
  searchParams,
}: PageProps<"/convite/[token]">) {
  const { token } = await params;
  const { erro } = await searchParams;
  const db = await getDb();
  const [view, session] = await Promise.all([getInvitation(db, token), getCurrentSession()]);

  if (view.status === "invalid") {
    const home = homePathFor(session);
    return (
      <AuthShell tagline={TAGLINE}>
        <div className="flex flex-col gap-8">
          <div className="flex flex-col gap-2">
            <h1 className="text-[1.75rem] font-semibold">Convite indisponível</h1>
            <p className="text-ink-muted">
              Este convite não vale mais. Peça um novo a quem convidou você.
            </p>
          </div>
          <Link
            href={home ?? "/entrar"}
            className={cn(buttonVariants({ size: "lg", variant: "outline" }), "w-full")}
          >
            {home ? "Ir para o painel" : "Entrar"}
          </Link>
        </div>
      </AuthShell>
    );
  }

  const isOwnerInvite = view.role === "owner";
  const alert = errorMessage(typeof erro === "string" ? erro : undefined, view.email, isOwnerInvite);

  // E-mail da conta que está logada neste navegador (se houver).
  let sessionEmail: string | null = null;
  if (session) {
    const [row] = await db
      .select({ email: users.email })
      .from(users)
      .where(eq(users.id, session.userId))
      .limit(1);
    sessionEmail = row?.email ?? null;
  }
  const signedInAsInvitee = sessionEmail !== null && sessionEmail === view.email;

  const title = isOwnerInvite ? "Sua agenda está pronta" : `${view.tenantName} convidou você`;
  const text = isOwnerInvite
    ? `Crie sua senha para entrar no painel de ${view.tenantName}.`
    : `Você vai acessar a agenda como ${ROLE_TEXT[view.role as keyof typeof ROLE_TEXT]}.`;

  const googleEnabled = isGoogleConfigured();
  const google = googleEnabled ? (
    <GoogleSection
      intent="login"
      href={`/convite/${encodeURIComponent(token)}/google`}
      label="Continuar com Google"
    />
  ) : null;

  let body: React.ReactNode;
  if (signedInAsInvitee) {
    // Já entrou com o e-mail convidado: um botão só.
    body = <AcceptSessionForm token={token} alert={alert} />;
  } else if (!isOwnerInvite && view.hasAccount) {
    // Tem conta, mas não está entrando com ela: pede para entrar (ou usar o Google).
    body = (
      <div className="flex flex-col gap-6">
        {alert ? <FormAlert>{alert}</FormAlert> : null}
        <p className="font-medium">Entre com {view.email} para aceitar.</p>
        <Link
          href={`/entrar?convite=${encodeURIComponent(token)}`}
          className={cn(buttonVariants({ size: "lg" }), "w-full")}
        >
          Entrar
        </Link>
        {google}
      </div>
    );
  } else {
    body = (
      <div className="flex flex-col gap-6">
        <AcceptPasswordForm
          token={token}
          defaultName={view.name}
          askName={!isOwnerInvite}
          alert={alert}
        />
        {google}
      </div>
    );
  }

  return (
    <AuthShell tagline={TAGLINE}>
      <div className="flex flex-col gap-8">
        <div className="flex flex-col gap-2">
          <h1 className="text-[1.75rem] font-semibold">{title}</h1>
          <p className="text-ink-muted">{text}</p>
        </div>
        {body}
      </div>
    </AuthShell>
  );
}
