import { cookies } from "next/headers";
import { SESSION_COOKIE, SESSION_MAX_AGE_SECONDS } from "./session";

/** Opções do cookie `ea_session`: httpOnly, secure em produção, sameSite lax, path `/`. */
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

export async function clearSessionCookie(): Promise<void> {
  (await cookies()).set(SESSION_COOKIE, "", sessionCookieOptions(0));
}
