"use server";

import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { getDb } from "@/db/client";
import {
  destroyCurrentSession,
  sessionCookieOptions,
  setSessionCookie,
} from "@/server/auth/cookie";
import { AuthError } from "@/server/auth/errors";
import {
  GOOGLE_ERROR_MESSAGE,
  GOOGLE_PENDING_COOKIE,
  completeGoogleSignup,
  parsePendingProfile,
  resolveGoogleUser,
} from "@/server/auth/google";
import { resolveLoginTenantId } from "@/server/auth/login";
import { completeGoogleSchema } from "@/server/auth/schemas";
import { createSession } from "@/server/auth/session";
import { currentClientIp } from "@/server/security/client-ip";
import { limitSignup } from "@/server/security/limits";
import { rateLimitMessage } from "@/server/security/rate-limit";
import type { AuthFormState } from "./actions";

const GENERIC_ERROR = "Não foi possível concluir agora. Tente novamente em instantes.";

const field = (formData: FormData, name: string) => {
  const value = formData.get(name);
  return typeof value === "string" ? value : "";
};

async function clearPendingCookie(): Promise<void> {
  (await cookies()).set(GOOGLE_PENDING_COOKIE, "", sessionCookieOptions(0));
}

/**
 * "Completar cadastro": relê (e confere a assinatura de) o cookie do perfil
 * pendente no servidor, cria a conta com o perfil do Google, abre a sessão,
 * apaga o cookie pendente e vai para o painel. Sem cookie válido volta ao
 * cadastro.
 */
export async function completeGoogleSignupAction(
  _previous: AuthFormState,
  formData: FormData,
): Promise<AuthFormState> {
  const profile = parsePendingProfile((await cookies()).get(GOOGLE_PENDING_COOKIE)?.value);
  if (!profile) redirect("/cadastro");

  // Mesmo limite do cadastro com senha: 5 por hora por IP. Só dados válidos
  // contam: um erro de digitação não gasta a tentativa.
  const input = {
    businessName: field(formData, "businessName"),
    whatsapp: field(formData, "whatsapp"),
  };
  if (completeGoogleSchema.safeParse(input).success) {
    const limit = limitSignup(await currentClientIp());
    if (!limit.ok) return { error: rateLimitMessage(limit.retryAfterSec) };
  }

  let token: string;
  try {
    const db = await getDb();

    // Entre o Google e este envio a conta pode ter passado a existir (duplo
    // clique, outra aba): nesse caso só entra.
    const resolved = await resolveGoogleUser(db, profile);
    if (resolved.kind === "error") return { error: GOOGLE_ERROR_MESSAGE };

    if (resolved.kind === "existing") {
      const tenantId = await resolveLoginTenantId(db, resolved.userId);
      token = await createSession(db, resolved.userId, tenantId);
    } else {
      const account = await completeGoogleSignup(db, profile, input);
      token = await createSession(db, account.userId, account.tenantId);
    }
    await destroyCurrentSession(db);
  } catch (error) {
    if (error instanceof AuthError) {
      if (error.code === "validation") return { fieldErrors: error.fieldErrors };
      return { error: error.message };
    }
    console.error("Falha ao completar o cadastro com o Google", error);
    return { error: GENERIC_ERROR };
  }

  await setSessionCookie(token);
  await clearPendingCookie();
  redirect("/painel");
}

/** "Usar outra conta": esquece o perfil do Google e volta ao cadastro. */
export async function discardGooglePendingAction(): Promise<void> {
  await clearPendingCookie();
  redirect("/cadastro");
}
