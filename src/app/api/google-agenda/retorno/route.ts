import { decodeIdToken } from "arctic";
import { eq } from "drizzle-orm";
import { NextResponse, type NextRequest } from "next/server";
import { getDb } from "@/db/client";
import { tenants } from "@/db/schema";
import { sessionCookieOptions } from "@/server/auth/cookie";
import { GCAL_STATE_COOKIE, GCAL_VERIFIER_COOKIE } from "@/server/auth/cookie-names";
import { createGoogleClient, isIdTokenForUs, parseGoogleClaims, publicBaseUrl } from "@/server/auth/google";
import { canAccessTenantPanel, getCurrentSession } from "@/server/auth/guard";
import { safeEqual } from "@/server/auth/signed-cookie";
import { CALENDAR_NAME, CALENDAR_SCOPE, googleCalendarEnabled } from "@/server/calendar/config";
import { connectionEligibility, getConnection, saveConnection } from "@/server/calendar/connections";
import { createCalendar } from "@/server/calendar/google-api";

export const dynamic = "force-dynamic";

const BACK = "/painel/integracoes";

/** Volta do Google depois do consentimento: confere state e PKCE, cria a agenda "Eneven Agenda" e guarda a conexão. */
export async function GET(request: NextRequest) {
  let base: string | null = null;
  let flag = "erro";
  try {
    base = publicBaseUrl(request.nextUrl.origin);
    flag = await handle(request, base);
  } catch (error) {
    console.error("Falha ao conectar o Google Agenda", error instanceof Error ? error.message : error);
  }
  const target = `${BACK}?google=${flag}`;
  const response = base ? NextResponse.redirect(`${base}${target}`) : new NextResponse(null, { status: 307, headers: { Location: target } });
  for (const name of [GCAL_STATE_COOKIE, GCAL_VERIFIER_COOKIE]) response.cookies.set(name, "", sessionCookieOptions(0));
  return response;
}

async function handle(request: NextRequest, base: string): Promise<string> {
  const session = await getCurrentSession();
  if (!canAccessTenantPanel(session) || session.support || !googleCalendarEnabled()) return "erro";
  const params = request.nextUrl.searchParams;
  const code = params.get("code");
  const state = params.get("state");
  const savedState = request.cookies.get(GCAL_STATE_COOKIE)?.value;
  const verifier = request.cookies.get(GCAL_VERIFIER_COOKIE)?.value;
  if (params.get("error")) return "cancelado";
  if (!code || !state || !savedState || !verifier || !safeEqual(state, savedState)) return "erro";

  const db = await getDb();
  if (!(await connectionEligibility(db, session.tenantId, session.userId)).eligible) return "indisponivel";
  const google = createGoogleClient(base, "/api/google-agenda/retorno");
  if (!google) return "erro";

  const tokens = await google.validateAuthorizationCode(code, verifier);
  // A pessoa pode desmarcar a permissão da agenda na tela do Google (consentimento granular).
  if (!tokens.scopes().includes(CALENDAR_SCOPE)) return "sem_permissao";
  if (!tokens.hasRefreshToken()) return "erro";
  const claims = decodeIdToken(tokens.idToken());
  if (!isIdTokenForUs(claims, process.env.GOOGLE_CLIENT_ID ?? "")) return "erro";
  const profile = parseGoogleClaims(claims);
  if (!profile) return "erro";

  // Reconectar reaproveita a agenda já criada; a primeira vez cria a "Eneven Agenda".
  const existing = await getConnection(db, session.tenantId, session.userId);
  let calendarId = existing?.calendarId ?? "";
  if (!existing) {
    const [tenant] = await db.select({ timezone: tenants.timezone }).from(tenants).where(eq(tenants.id, session.tenantId)).limit(1);
    calendarId = await createCalendar(tokens.accessToken(), { summary: CALENDAR_NAME, timeZone: tenant?.timezone ?? "America/Sao_Paulo" });
  }
  await saveConnection(db, { tenantId: session.tenantId, userId: session.userId, googleEmail: profile.email, refreshToken: tokens.refreshToken(), calendarId, calendarName: CALENDAR_NAME });
  return "conectado";
}
