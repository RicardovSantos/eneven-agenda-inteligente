import { NextResponse, type NextRequest } from "next/server";
import { publicBaseUrl } from "@/server/auth/google";
import { startGoogleFlow } from "@/server/auth/google-start";

/**
 * Início do "Entrar com o Google": gera `state` e PKCE, guarda nos cookies
 * (10 min) e manda a pessoa para o Google. `?intent=login|signup` só decide a
 * tela de volta em caso de erro e o texto do botão; a conta nova vai sempre
 * para "Completar cadastro".
 */
export async function GET(request: NextRequest) {
  const base = publicBaseUrl(request.nextUrl.origin);
  const intent = request.nextUrl.searchParams.get("intent") === "signup" ? "signup" : "login";
  // Sem credenciais o botão nem aparece; chegar aqui é link antigo ou digitado.
  return startGoogleFlow(base, intent) ?? NextResponse.redirect(`${base}/entrar?erro=google`);
}
