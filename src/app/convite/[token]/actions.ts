"use server";

import { redirect } from "next/navigation";
import { getDb } from "@/db/client";
import { destroyCurrentSession, setSessionCookie } from "@/server/auth/cookie";
import { getCurrentSession } from "@/server/auth/guard";
import { createSession } from "@/server/auth/session";
import { currentClientIp } from "@/server/security/client-ip";
import { limitAcceptInvite } from "@/server/security/limits";
import { rateLimitMessage } from "@/server/security/rate-limit";
import { acceptInvitation, getInvitation } from "@/server/team/accept";
import { TeamError } from "@/server/team/errors";

export type InviteFormState = {
  /** Erro geral (faixa no topo do formulário). */
  error?: string;
  /** Erro por campo, pelo `name` do campo. */
  fieldErrors?: Record<string, string>;
};

const GENERIC_ERROR = "Não foi possível concluir agora. Tente novamente em instantes.";

const field = (formData: FormData, name: string) => {
  const value = formData.get(name);
  return typeof value === "string" ? value : "";
};

function toState(error: unknown): InviteFormState {
  if (error instanceof TeamError) {
    return error.code === "validation"
      ? { fieldErrors: error.fieldErrors, error: error.fieldErrors ? undefined : error.message }
      : { error: error.message };
  }
  console.error("Falha ao aceitar o convite", error);
  return { error: GENERIC_ERROR };
}

/**
 * Aceita o convite, abre a sessão no estabelecimento do convite (a sessão
 * antiga deste navegador é descartada) e vai para o painel. `redirect` fica
 * fora do `try` (ele lança).
 */
async function acceptAndSignIn(
  token: string,
  run: (db: Awaited<ReturnType<typeof getDb>>) => Promise<{ userId: string; tenantId: string }>,
): Promise<InviteFormState> {
  let sessionToken: string;
  try {
    const db = await getDb();
    const { userId, tenantId } = await run(db);
    sessionToken = await createSession(db, userId, tenantId);
    await destroyCurrentSession(db);
  } catch (error) {
    return toState(error);
  }
  await setSessionCookie(sessionToken);
  redirect("/painel");
}

/**
 * Convite para e-mail sem conta (Nome + Senha) ou de proprietário (só Senha).
 * 10 tentativas / 15 min por IP, contadas antes de gastar o convite.
 */
export async function acceptInviteAction(
  _previous: InviteFormState,
  formData: FormData,
): Promise<InviteFormState> {
  const token = field(formData, "token");
  const limit = limitAcceptInvite(await currentClientIp());
  if (!limit.ok) return { error: rateLimitMessage(limit.retryAfterSec) };

  return acceptAndSignIn(token, async (db) => {
    const view = await getInvitation(db, token);
    if (view.status === "invalid") throw new TeamError("invalid_invitation");
    const password = field(formData, "password");
    return acceptInvitation(
      db,
      token,
      view.role === "owner" ? { password } : { name: field(formData, "name"), password },
    );
  });
}

/**
 * Botão "Aceitar convite" de quem já está logado com o e-mail do convite. O
 * usuário vem da sessão, nunca do formulário. Sem sessão: vai entrar.
 */
export async function acceptInviteAsCurrentUserAction(
  _previous: InviteFormState,
  formData: FormData,
): Promise<InviteFormState> {
  const token = field(formData, "token");
  const session = await getCurrentSession();
  if (!session) redirect(`/entrar?convite=${encodeURIComponent(token)}`);

  const limit = limitAcceptInvite(await currentClientIp());
  if (!limit.ok) return { error: rateLimitMessage(limit.retryAfterSec) };

  return acceptAndSignIn(token, (db) => acceptInvitation(db, token, { userId: session.userId }));
}
