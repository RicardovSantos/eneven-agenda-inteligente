"use server";

import { redirect } from "next/navigation";
import { getDb } from "@/db/client";
import { runAfterResponse } from "@/server/after";
import { destroyCurrentSession, setSessionCookie } from "@/server/auth/cookie";
import {
  requestPasswordReset,
  sendVerificationEmail,
} from "@/server/auth/email-flows";
import { resetPassword } from "@/server/auth/email-tokens";
import { AuthError } from "@/server/auth/errors";
import { requireTenantSession } from "@/server/auth/guard";
import { login, normalizeEmail, resolveLoginTarget } from "@/server/auth/login";
import {
  LOGIN_FAILED_MESSAGE,
  forgotPasswordSchema,
  loginSchema,
  resetPasswordSchema,
  signupSchema,
  toFieldErrors,
} from "@/server/auth/schemas";
import { createSession } from "@/server/auth/session";
import { signup } from "@/server/auth/signup";
import { currentClientIp } from "@/server/security/client-ip";
import {
  limitAcceptInvite,
  limitForgotPassword,
  limitLogin,
  limitSignup,
} from "@/server/security/limits";
import { acceptInvitation } from "@/server/team/accept";
import { TeamError } from "@/server/team/errors";
import { rateLimitMessage } from "@/server/security/rate-limit";

export type AuthFormState = {
  /** Erro geral (faixa no topo do formulário). */
  error?: string;
  /** Erro por campo, pelo `name` do campo. */
  fieldErrors?: Record<string, string>;
  /** `true` quando o e-mail já tem conta (mostra o link "Entre"). */
  emailTaken?: boolean;
  /** `true` depois de pedir o link de redefinição (mesma resposta para qualquer e-mail). */
  sent?: boolean;
};

export type ResendState = {
  success?: string;
  error?: string;
};

const GENERIC_ERROR = "Não foi possível concluir agora. Tente novamente em instantes.";

const field = (formData: FormData, name: string) => {
  const value = formData.get(name);
  return typeof value === "string" ? value : "";
};

export async function signupAction(
  _previous: AuthFormState,
  formData: FormData,
): Promise<AuthFormState> {
  const input = {
    businessName: field(formData, "businessName"),
    ownerName: field(formData, "ownerName"),
    whatsapp: field(formData, "whatsapp"),
    email: field(formData, "email"),
    password: field(formData, "password"),
  };

  // 5 cadastros por hora por IP. Só dados válidos contam: um erro de
  // digitação não gasta a tentativa.
  if (signupSchema.safeParse(input).success) {
    const limit = limitSignup(await currentClientIp());
    if (!limit.ok) return { error: rateLimitMessage(limit.retryAfterSec) };
  }

  let token: string;
  try {
    const db = await getDb();
    const account = await signup(db, input);
    token = await createSession(db, account.userId, account.tenantId);
    await destroyCurrentSession(db);

    // O e-mail sai depois da resposta (não segura o cadastro). Se falhar, o
    // token emitido é apagado e "Reenviar e-mail" no painel tenta de novo na hora.
    await runAfterResponse(async () => {
      try {
        await sendVerificationEmail(db, account.userId);
      } catch (error) {
        console.error("Falha ao enviar o e-mail de confirmação", error);
      }
    });
  } catch (error) {
    if (error instanceof AuthError) {
      if (error.code === "validation" || error.code === "email_taken") {
        return {
          fieldErrors: error.fieldErrors,
          emailTaken: error.code === "email_taken",
        };
      }
      return { error: error.message };
    }
    console.error("Falha no cadastro", error);
    return { error: GENERIC_ERROR };
  }

  await setSessionCookie(token);
  redirect("/painel");
}

export async function loginAction(
  _previous: AuthFormState,
  formData: FormData,
): Promise<AuthFormState> {
  const parsed = loginSchema.safeParse({
    email: field(formData, "email"),
    password: field(formData, "password"),
  });
  if (!parsed.success) return { fieldErrors: toFieldErrors(parsed.error) };

  // 10 tentativas por IP + e-mail e 30 por IP, a cada 15 min.
  const limit = limitLogin(await currentClientIp(), normalizeEmail(parsed.data.email));
  if (!limit.ok) return { error: rateLimitMessage(limit.retryAfterSec) };

  // Vindo de "Entrar" na página do convite (`/entrar?convite=`): depois de
  // entrar, aceita o convite e a sessão nasce no estabelecimento dele.
  const invite = field(formData, "convite");

  let token: string;
  let redirectTo: string;
  try {
    const db = await getDb();
    const result = await login(db, parsed.data.email, parsed.data.password);
    if (!result) return { error: LOGIN_FAILED_MESSAGE };
    const target = await resolveLoginTarget(db, result.userId);
    let tenantId = target.tenantId;
    redirectTo = target.redirectTo;
    if (invite) {
      // Conta que não é a do convite (ou convite que não vale mais): entra
      // normalmente e a página do convite explica o que houve.
      const back = `/convite/${encodeURIComponent(invite)}`;
      redirectTo = back;
      if (limitAcceptInvite(await currentClientIp()).ok) {
        try {
          const accepted = await acceptInvitation(db, invite, { userId: result.userId });
          tenantId = accepted.tenantId;
          redirectTo = "/painel";
        } catch (error) {
          if (!(error instanceof TeamError)) throw error;
        }
      }
    }
    token = await createSession(db, result.userId, tenantId);
    await destroyCurrentSession(db);
  } catch (error) {
    console.error("Falha no login", error);
    return { error: GENERIC_ERROR };
  }

  await setSessionCookie(token);
  redirect(redirectTo);
}

/** Usada com `useActionState`; não precisa do estado anterior nem do formulário. */
export async function resendVerificationAction(): Promise<ResendState> {
  const session = await requireTenantSession();

  try {
    const result = await sendVerificationEmail(await getDb(), session.userId);
    switch (result.status) {
      case "sent":
        return { success: `Enviamos um novo link para ${result.email}.` };
      case "cooldown":
        return { error: "Aguarde um minuto para reenviar." };
      case "already_verified":
        return { success: "Seu e-mail já está confirmado." };
      default:
        return { error: GENERIC_ERROR };
    }
  } catch (error) {
    console.error("Falha ao reenviar o e-mail de confirmação", error);
    return { error: "Não foi possível enviar o e-mail agora. Tente novamente em instantes." };
  }
}

export async function forgotPasswordAction(
  _previous: AuthFormState,
  formData: FormData,
): Promise<AuthFormState> {
  const parsed = forgotPasswordSchema.safeParse({ email: field(formData, "email") });
  if (!parsed.success) return { fieldErrors: toFieldErrors(parsed.error) };

  // 5 pedidos por hora por IP e por e-mail. Passou do limite: a resposta é a
  // mesma (neutra), só que nada é processado. O bloqueio não é revelado.
  const limit = limitForgotPassword(await currentClientIp(), normalizeEmail(parsed.data.email));
  if (!limit.ok) return { sent: true };

  // A busca e o envio rodam depois da resposta, para que o tempo de resposta
  // não diga se a conta existe. `requestPasswordReset` nunca lança.
  await runAfterResponse(async () => requestPasswordReset(await getDb(), parsed.data.email));
  return { sent: true };
}

export async function resetPasswordAction(
  _previous: AuthFormState,
  formData: FormData,
): Promise<AuthFormState> {
  const token = field(formData, "token");
  const parsed = resetPasswordSchema.safeParse({
    password: field(formData, "password"),
    confirmPassword: field(formData, "confirmPassword"),
  });
  if (!parsed.success) return { fieldErrors: toFieldErrors(parsed.error) };

  let ok: boolean;
  try {
    ok = (await resetPassword(await getDb(), token, parsed.data.password)).ok;
  } catch (error) {
    console.error("Falha ao redefinir a senha", error);
    return { error: GENERIC_ERROR };
  }

  // Link vencido ou já usado: a página do link explica e oferece um novo.
  if (!ok) redirect(`/recuperar-senha/${encodeURIComponent(token)}`);
  redirect("/entrar?senha=redefinida");
}
