import { generateCodeVerifier, generateState } from "arctic";
import { NextResponse } from "next/server";
import { sessionCookieOptions } from "./cookie";
import {
  GOOGLE_SCOPES,
  OAUTH_COOKIE_MAX_AGE_SECONDS,
  OAUTH_INTENT_COOKIE,
  OAUTH_STATE_COOKIE,
  OAUTH_VERIFIER_COOKIE,
  createGoogleClient,
} from "./google";

/**
 * Início do fluxo do Google: gera `state` e PKCE, grava os cookies do fluxo
 * (10 min) na resposta e redireciona ao Google. Devolve `null` sem credenciais
 * (quem chama decide a tela de volta). `intent` decide a tela de volta em caso
 * de erro; `"invite"` só é pedido pela rota do convite, junto com o cookie
 * assinado do token.
 */
export function startGoogleFlow(
  base: string,
  intent: "login" | "signup" | "invite",
): NextResponse | null {
  const google = createGoogleClient(base);
  if (!google) return null;

  const state = generateState();
  const codeVerifier = generateCodeVerifier();
  const url = google.createAuthorizationURL(state, codeVerifier, GOOGLE_SCOPES);
  // Deixa escolher a conta (quem tem várias não entra direto na errada).
  url.searchParams.set("prompt", "select_account");

  const response = NextResponse.redirect(url);
  const options = sessionCookieOptions(OAUTH_COOKIE_MAX_AGE_SECONDS);
  response.cookies.set(OAUTH_STATE_COOKIE, state, options);
  response.cookies.set(OAUTH_VERIFIER_COOKIE, codeVerifier, options);
  response.cookies.set(OAUTH_INTENT_COOKIE, intent, options);
  return response;
}
