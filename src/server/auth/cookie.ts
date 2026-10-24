import { cookies } from "next/headers";
import type { Db } from "@/db/types";
import { SESSION_COOKIE } from "./cookie-names";
import { SESSION_MAX_AGE_SECONDS, destroySession } from "./session";

/** Opções dos cookies de autenticação (`ea_session` etc.): httpOnly, secure em produção, sameSite lax, path `/`. */
export function sessionCookieOptions(maxAge: number) {
  return {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax" as const,
    path: "/",
    maxAge,
  };
}

export async function setSessionCookie(token: string): Promise<void> {
  (await cookies()).set(
    SESSION_COOKIE,
    token,
    sessionCookieOptions(SESSION_MAX_AGE_SECONDS),
  );
}

/**
 * Apaga do banco a sessão antiga do navegador (se houver) quando ele entra de
 * novo: login, cadastro ou retorno do Google. Falhas são só registradas; o
 * cookie novo substitui o antigo de qualquer jeito.
 */
export async function destroyCurrentSession(db: Db): Promise<void> {
  try {
    const old = (await cookies()).get(SESSION_COOKIE)?.value;
    if (old) await destroySession(db, old);
  } catch (error) {
    console.error("Falha ao apagar a sessão antiga", error);
  }
}
