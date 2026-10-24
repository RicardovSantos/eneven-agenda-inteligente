import { decodeIdToken } from "arctic";
import { NextResponse, type NextRequest } from "next/server";
import { getDb } from "@/db/client";
import { sessionCookieOptions } from "@/server/auth/cookie";
import {
  GOOGLE_PENDING_COOKIE,
  GOOGLE_PENDING_MAX_AGE_SECONDS,
  OAUTH_INTENT_COOKIE,
  OAUTH_STATE_COOKIE,
  OAUTH_VERIFIER_COOKIE,
  createGoogleClient,
  isIdTokenForUs,
  parseGoogleClaims,
  publicBaseUrl,
  resolveGoogleUser,
  signPendingProfile,
} from "@/server/auth/google";
import { resolveLoginTenantId } from "@/server/auth/login";
import {
  SESSION_COOKIE,
  SESSION_MAX_AGE_SECONDS,
  createSession,
  destroySession,
} from "@/server/auth/session";
import { safeEqual } from "@/server/auth/signed-cookie";

type Outcome =
  | { to: string; session?: string; pending?: string }
  | { to: "error" };

/**
 * Volta do Google. Confere `state` e cookies, troca o código (PKCE) e lê o
 * id_token. Conta conhecida: cria a sessão e vai ao painel. Conta nova: guarda
 * o perfil assinado e vai para "Completar cadastro". Qualquer falha ou
 * cancelamento: `/entrar?erro=google`. Os cookies do fluxo são sempre apagados.
 */
export async function GET(request: NextRequest) {
  const base = publicBaseUrl(request.nextUrl.origin);

  let outcome: Outcome;
  try {
    outcome = await handle(request, base);
  } catch (error) {
    console.error("Falha no retorno do Google", error);
    outcome = { to: "error" };
  }

  const response = NextResponse.redirect(
    `${base}${outcome.to === "error" ? "/entrar?erro=google" : outcome.to}`,
  );
  for (const name of [OAUTH_STATE_COOKIE, OAUTH_VERIFIER_COOKIE, OAUTH_INTENT_COOKIE]) {
    response.cookies.set(name, "", sessionCookieOptions(0));
  }
  if ("session" in outcome && outcome.session) {
    response.cookies.set(
      SESSION_COOKIE,
      outcome.session,
      sessionCookieOptions(SESSION_MAX_AGE_SECONDS),
    );
  }
  if ("pending" in outcome && outcome.pending) {
    response.cookies.set(
      GOOGLE_PENDING_COOKIE,
      outcome.pending,
      sessionCookieOptions(GOOGLE_PENDING_MAX_AGE_SECONDS),
    );
  }
  return response;
}

async function handle(request: NextRequest, base: string): Promise<Outcome> {
  const params = request.nextUrl.searchParams;
  const code = params.get("code");
  const state = params.get("state");
  const savedState = request.cookies.get(OAUTH_STATE_COOKIE)?.value;
  const codeVerifier = request.cookies.get(OAUTH_VERIFIER_COOKIE)?.value;
  const intent = request.cookies.get(OAUTH_INTENT_COOKIE)?.value;

  // Cancelou ou o Google devolveu erro; ou o retorno não veio do nosso início.
  if (params.get("error") || !code || !state) return { to: "error" };
  if (!savedState || !codeVerifier || !intent) return { to: "error" };
  if (!safeEqual(state, savedState)) return { to: "error" };

  const google = createGoogleClient(base);
  if (!google) return { to: "error" };

  const tokens = await google.validateAuthorizationCode(code, codeVerifier);
  const claims = decodeIdToken(tokens.idToken());
  if (!isIdTokenForUs(claims, process.env.GOOGLE_CLIENT_ID ?? "")) return { to: "error" };
  const profile = parseGoogleClaims(claims);
  if (!profile) return { to: "error" };

  const db = await getDb();
  const result = await resolveGoogleUser(db, profile);
  if (result.kind === "error") return { to: "error" };

  if (result.kind === "new") {
    // Mesmo vindo de "Entrar": criar a conta é o próximo passo natural.
    return { to: "/cadastro/completar", pending: signPendingProfile(profile) };
  }

  const tenantId = await resolveLoginTenantId(db, result.userId);
  const session = await createSession(db, result.userId, tenantId);

  // Quem já tinha uma sessão neste navegador perde a antiga.
  const oldSession = request.cookies.get(SESSION_COOKIE)?.value;
  if (oldSession) {
    try {
      await destroySession(db, oldSession);
    } catch (error) {
      console.error("Falha ao apagar a sessão antiga", error);
    }
  }
  return { to: "/painel", session };
}
