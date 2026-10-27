import { decodeIdToken } from "arctic";
import { NextResponse, type NextRequest } from "next/server";
import { getDb } from "@/db/client";
import { sessionCookieOptions } from "@/server/auth/cookie";
import { INVITE_COOKIE } from "@/server/auth/cookie-names";
import {
  GOOGLE_ERROR_MESSAGE,
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
import { resolveLoginTarget } from "@/server/auth/login";
import {
  SESSION_COOKIE,
  SESSION_MAX_AGE_SECONDS,
  createSession,
  destroySession,
} from "@/server/auth/session";
import { readInviteCookie } from "@/server/auth/invite-cookie";
import { safeEqual } from "@/server/auth/signed-cookie";
import { getClientIp } from "@/server/security/rate-limit";
import { limitAcceptInvite } from "@/server/security/limits";
import { acceptInvitation } from "@/server/team/accept";
import { TeamError } from "@/server/team/errors";

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
  let base: string | null = null;
  let outcome: Outcome;
  try {
    // Dentro do try: sem APP_URL em produção cai em `/entrar?erro=google`, não num 500.
    base = publicBaseUrl(request.nextUrl.origin);
    outcome = await handle(request, base);
  } catch (error) {
    console.error("Falha no retorno do Google", error);
    outcome = { to: "error" };
  }

  const destination = outcome.to === "error" ? "/entrar?erro=google" : outcome.to;
  // Sem endereço público confiável (APP_URL ausente) o redirecionamento é
  // relativo: a origem da requisição, atrás do proxy, é a interna.
  const response = base
    ? NextResponse.redirect(`${base}${destination}`)
    : new NextResponse(null, { status: 307, headers: { Location: destination } });
  for (const name of [OAUTH_STATE_COOKIE, OAUTH_VERIFIER_COOKIE, OAUTH_INTENT_COOKIE, INVITE_COOKIE]) {
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
  const inviteToken = readInviteCookie(request.cookies.get(INVITE_COOKIE)?.value);

  // Cancelou ou o Google devolveu erro; ou o retorno não veio do nosso início.
  if (params.get("error") || !code || !state) return { to: "error" };
  if (!savedState || !codeVerifier || !intent) return { to: "error" };
  if (!safeEqual(state, savedState)) return { to: "error" };
  if (intent === "invite" && !inviteToken) return { to: "error" };

  const google = createGoogleClient(base);
  if (!google) return { to: "error" };

  const tokens = await google.validateAuthorizationCode(code, codeVerifier);
  const claims = decodeIdToken(tokens.idToken());
  if (!isIdTokenForUs(claims, process.env.GOOGLE_CLIENT_ID ?? "")) return { to: "error" };
  const profile = parseGoogleClaims(claims);
  if (!profile) return { to: "error" };

  const db = await getDb();

  // "Continuar com Google" na página do convite: o cookie assinado do token e a
  // intenção `invite` andam juntos. A intenção sem cookie válido é erro; o
  // cookie sozinho (intenção de login/cadastro) é ignorado.
  if (intent === "invite") {
    return acceptInviteWithGoogle(request, db, inviteToken, profile);
  }

  const result = await resolveGoogleUser(db, profile);
  if (result.kind === "error") return { to: "error" };

  if (result.kind === "new") {
    // Mesmo vindo de "Entrar": criar a conta é o próximo passo natural.
    return { to: "/cadastro/completar", pending: signPendingProfile(profile) };
  }

  const { tenantId, redirectTo } = await resolveLoginTarget(db, result.userId);
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
  return { to: redirectTo, session };
}

/** Flag de `?erro=` da página do convite para cada recusa. */
function inviteErrorFlag(error: TeamError): string {
  if (error.code === "wrong_account") {
    return error.message === GOOGLE_ERROR_MESSAGE ? "google" : "conta";
  }
  if (error.code === "already_member") return "membro";
  if (error.code === "other_tenant") return "outro";
  return "google";
}

/**
 * Aceita o convite com o perfil do Google (e-mail verificado igual ao do
 * convite) e abre a sessão no estabelecimento do convite. Recusas voltam à
 * página do convite com um flag de erro; nunca criam sessão.
 */
async function acceptInviteWithGoogle(
  request: NextRequest,
  db: Awaited<ReturnType<typeof getDb>>,
  token: string | null,
  profile: NonNullable<ReturnType<typeof parseGoogleClaims>>,
): Promise<Outcome> {
  if (!token) return { to: "error" };
  const back = `/convite/${encodeURIComponent(token)}`;

  // 10 / 15 min por IP, antes de gastar o convite.
  if (!limitAcceptInvite(getClientIp(request.headers)).ok) return { to: `${back}?erro=limite` };

  let accepted: { userId: string; tenantId: string };
  try {
    accepted = await acceptInvitation(db, token, { googleProfile: profile });
  } catch (error) {
    if (!(error instanceof TeamError)) throw error;
    return {
      to: error.code === "invalid_invitation" ? back : `${back}?erro=${inviteErrorFlag(error)}`,
    };
  }

  const session = await createSession(db, accepted.userId, accepted.tenantId);
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
