import { INVITE_COOKIE_PURPOSE } from "./cookie-names";
import { OAUTH_COOKIE_MAX_AGE_SECONDS } from "./google";
import { signValue, verifyValue } from "./signed-cookie";

/**
 * Cookie do convite durante o "Continuar com Google": guarda o token assinado
 * (HMAC com rótulo próprio) e vence junto com o fluxo do Google (10 min). Só o
 * servidor lê; o navegador nunca o vê em JavaScript (httpOnly).
 */
export function signInviteCookie(token: string): string {
  return signValue({ token }, OAUTH_COOKIE_MAX_AGE_SECONDS, INVITE_COOKIE_PURPOSE);
}

/** Token do convite, ou `null` se o valor for ausente, adulterado, vencido ou de outro cookie. */
export function readInviteCookie(value: string | undefined): string | null {
  if (!value) return null;
  const data = verifyValue<{ token?: unknown }>(value, INVITE_COOKIE_PURPOSE);
  return typeof data?.token === "string" && data.token ? data.token : null;
}
