import { generateCodeVerifier, generateState } from "arctic";
import { NextResponse, type NextRequest } from "next/server";
import { sessionCookieOptions } from "@/server/auth/cookie";
import {
  GOOGLE_SCOPES,
  OAUTH_COOKIE_MAX_AGE_SECONDS,
  OAUTH_INTENT_COOKIE,
  OAUTH_STATE_COOKIE,
  OAUTH_VERIFIER_COOKIE,
  createGoogleClient,
  publicBaseUrl,
} from "@/server/auth/google";

/**
 * Início do "Entrar com o Google": gera `state` e PKCE, guarda nos cookies
 * (10 min) e manda a pessoa para o Google. `?intent=login|signup` só decide a
 * tela de volta em caso de erro e o texto do botão; a conta nova vai sempre
 * para "Completar cadastro".
 */
export async function GET(request: NextRequest) {
  const base = publicBaseUrl(request.nextUrl.origin);
  const google = createGoogleClient(base);
  if (!google) {
    // Sem credenciais o botão nem aparece; chegar aqui é link antigo ou digitado.
    return NextResponse.redirect(`${base}/entrar?erro=google`);
  }

  const intent = request.nextUrl.searchParams.get("intent") === "signup" ? "signup" : "login";
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
