"use server";

import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { getDb } from "@/db/client";
import { AccountDeletionError } from "@/server/account/errors";
import { revokeConnections } from "@/server/calendar/connections";
import { cancelTenantBilling } from "@/server/account/cancel-billing";
import { deleteAccount } from "@/server/account/delete-account";
import { sessionCookieOptions } from "@/server/auth/cookie";
import { requireTenantSession } from "@/server/auth/guard";
import { SESSION_COOKIE, destroySession } from "@/server/auth/session";
import { limitDeleteAccount } from "@/server/security/limits";
import { rateLimitMessage } from "@/server/security/rate-limit";

export type DeleteAccountState = { error?: string };

const field = (formData: FormData, name: string) => {
  const value = formData.get(name);
  return typeof value === "string" ? value : "";
};

/**
 * Exclui a conta de quem está logado (proprietário: o estabelecimento inteiro; equipe: só a própria
 * conta). Exige digitar EXCLUIR e, em conta com senha, a senha. Em modo suporte nunca roda: quem
 * está lá é a administração entrando como o estabelecimento.
 */
export async function deleteAccountAction(_previous: DeleteAccountState, formData: FormData): Promise<DeleteAccountState> {
  const session = await requireTenantSession();
  if (session.support) return { error: "Indisponível no modo suporte." };

  const limit = limitDeleteAccount(session.userId);
  if (!limit.ok) return { error: rateLimitMessage(limit.retryAfterSec) };

  const db = await getDb();
  try {
    await deleteAccount(
      db,
      {
        userId: session.userId,
        tenantId: session.tenantId,
        confirmation: field(formData, "confirmation"),
        password: field(formData, "password"),
      },
      { cancelBilling: (input) => cancelTenantBilling(db, input), revokeCalendar: (input) => revokeConnections(db, input) },
    );
  } catch (error) {
    if (error instanceof AccountDeletionError) return { error: error.message };
    console.error("Falha ao excluir a conta", error);
    return { error: "Não foi possível excluir agora. Tente novamente em instantes ou fale com o suporte." };
  }

  // A conta (ou o acesso a este estabelecimento) acabou: encerra a sessão deste navegador.
  const jar = await cookies();
  const token = jar.get(SESSION_COOKIE)?.value;
  if (token) await destroySession(db, token).catch(() => undefined);
  jar.set(SESSION_COOKIE, "", sessionCookieOptions(0));
  redirect("/entrar?conta=excluida");
}
