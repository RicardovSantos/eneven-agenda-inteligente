"use server";

import { redirect } from "next/navigation";
import { getDb } from "@/db/client";
import { setSessionCookie } from "@/server/auth/cookie";
import { AuthError } from "@/server/auth/errors";
import { login, resolveLoginTenantId } from "@/server/auth/login";
import {
  LOGIN_FAILED_MESSAGE,
  loginSchema,
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
