"use server";

import { redirect } from "next/navigation";
import { after } from "next/server";
import { getDb } from "@/db/client";
import { setSessionCookie } from "@/server/auth/cookie";
import {
  requestPasswordReset,
  sendVerificationEmail,
} from "@/server/auth/email-flows";
import { resetPassword } from "@/server/auth/email-tokens";
import { AuthError } from "@/server/auth/errors";
import { requireTenantSession } from "@/server/auth/guard";
import { login, resolveLoginTenantId } from "@/server/auth/login";
import {
  LOGIN_FAILED_MESSAGE,
  forgotPasswordSchema,
  loginSchema,
  resetPasswordSchema,
  toFieldErrors,
} from "@/server/auth/schemas";
import { createSession } from "@/server/auth/session";
import { signup } from "@/server/auth/signup";

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
  let token: string;
  try {
    const db = await getDb();
    const account = await signup(db, {
      businessName: field(formData, "businessName"),
      ownerName: field(formData, "ownerName"),
      whatsapp: field(formData, "whatsapp"),
      email: field(formData, "email"),
      password: field(formData, "password"),
    });
    token = await createSession(db, account.userId, account.tenantId);

    // Falha no envio não quebra o cadastro: "Reenviar e-mail" no painel tenta de novo.
    try {
      await sendVerificationEmail(db, account.userId);
    } catch (error) {
      console.error("Falha ao enviar o e-mail de confirmação", error);
    }
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

  let token: string;
  try {
    const db = await getDb();
    const result = await login(db, parsed.data.email, parsed.data.password);
    if (!result) return { error: LOGIN_FAILED_MESSAGE };
    const tenantId = await resolveLoginTenantId(db, result.userId);
    token = await createSession(db, result.userId, tenantId);
  } catch (error) {
    console.error("Falha no login", error);
    return { error: GENERIC_ERROR };
  }

  await setSessionCookie(token);
  redirect("/painel");
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

  // A busca e o envio rodam depois da resposta, para que o tempo de resposta
  // não diga se a conta existe. `requestPasswordReset` nunca lança.
  const job = async () => requestPasswordReset(await getDb(), parsed.data.email);
  try {
    after(job);
  } catch {
    // Fora de uma requisição (ex.: testes): roda na hora.
    await job();
  }
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
