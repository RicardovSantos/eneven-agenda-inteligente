import { generateCodeVerifier, generateState } from "arctic";
import { NextResponse, type NextRequest } from "next/server";
import { getDb } from "@/db/client";
import { sessionCookieOptions } from "@/server/auth/cookie";
import { GCAL_STATE_COOKIE, GCAL_VERIFIER_COOKIE } from "@/server/auth/cookie-names";
import { OAUTH_COOKIE_MAX_AGE_SECONDS, createGoogleClient, publicBaseUrl } from "@/server/auth/google";
import { canAccessTenantPanel, getCurrentSession } from "@/server/auth/guard";
import { connectionEligibility } from "@/server/calendar/connections";
import { CALENDAR_SCOPE, googleCalendarEnabled } from "@/server/calendar/config";

export const dynamic = "force-dynamic";

const BACK = "/painel/integracoes";

/** Início da conexão com o Google Agenda: só logado, com a integração ligada. Pede acesso só à agenda do app. */
export async function GET(request: NextRequest) {
  const base = publicBaseUrl(request.nextUrl.origin);
  const back = (flag?: string) => NextResponse.redirect(`${base}${BACK}${flag ? `?google=${flag}` : ""}`);
  const session = await getCurrentSession();
  if (!canAccessTenantPanel(session) || session.support) return NextResponse.redirect(`${base}/entrar`);
  if (!googleCalendarEnabled()) return back();
  const eligibility = await connectionEligibility(await getDb(), session.tenantId, session.userId);
  if (!eligibility.eligible) return back("indisponivel");
  const google = createGoogleClient(base, "/api/google-agenda/retorno");
  if (!google) return back("erro");

  const state = generateState();
  const verifier = generateCodeVerifier();
  const url = google.createAuthorizationURL(state, verifier, ["openid", "email", CALENDAR_SCOPE]);
  // `offline` + `consent`: sem isso o Google não devolve o token de renovação, e a conexão cairia em 1 hora.
  url.searchParams.set("access_type", "offline");
  url.searchParams.set("prompt", "consent select_account");
  const response = NextResponse.redirect(url);
  const options = sessionCookieOptions(OAUTH_COOKIE_MAX_AGE_SECONDS);
  response.cookies.set(GCAL_STATE_COOKIE, state, options);
  response.cookies.set(GCAL_VERIFIER_COOKIE, verifier, options);
  return response;
}
