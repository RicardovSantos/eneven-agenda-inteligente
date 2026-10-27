import { NextResponse, type NextRequest } from "next/server";
import { getDb } from "@/db/client";
import { sessionCookieOptions } from "@/server/auth/cookie";
import { INVITE_COOKIE } from "@/server/auth/cookie-names";
import { OAUTH_COOKIE_MAX_AGE_SECONDS, publicBaseUrl } from "@/server/auth/google";
import { startGoogleFlow } from "@/server/auth/google-start";
import { signInviteCookie } from "@/server/auth/invite-cookie";
import { limitPublicRead } from "@/server/security/limits";
import { getClientIp } from "@/server/security/rate-limit";
import { getInvitation } from "@/server/team/accept";

/**
 * "Continuar com Google" na página do convite: confere que o convite ainda
 * vale, guarda o token num cookie httpOnly assinado (10 min) e inicia o fluxo
 * do Google com `intent=invite`. O retorno (`/api/auth/google/callback`) só
 * aceita o convite quando os dois estão presentes.
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ token: string }> },
) {
  const { token } = await params;
  const base = publicBaseUrl(request.nextUrl.origin);
  const back = `${base}/convite/${encodeURIComponent(token)}`;

  // Antes de ler o banco: 120 / min por IP.
  if (!limitPublicRead(getClientIp(request.headers)).ok) {
    return NextResponse.redirect(`${back}?erro=limite`);
  }

  const view = await getInvitation(await getDb(), token);
  if (view.status !== "valid") return NextResponse.redirect(back);

  const response = startGoogleFlow(base, "invite");
  if (!response) return NextResponse.redirect(`${back}?erro=google`);
  response.cookies.set(
    INVITE_COOKIE,
    signInviteCookie(token),
    sessionCookieOptions(OAUTH_COOKIE_MAX_AGE_SECONDS),
  );
  return response;
}
