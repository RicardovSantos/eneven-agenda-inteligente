import { NextResponse, type NextRequest } from "next/server";
import { getDb } from "@/db/client";
import { sessionCookieOptions } from "@/server/auth/cookie";
import { SESSION_COOKIE, destroySession } from "@/server/auth/session";

/** Sair: só por POST (botão do painel). Apaga a sessão no banco e o cookie. */
export async function POST(request: NextRequest) {
  const token = request.cookies.get(SESSION_COOKIE)?.value;
  if (token) {
    try {
      await destroySession(await getDb(), token);
    } catch (error) {
      console.error("Falha ao encerrar a sessão", error);
    }
  }
  // 303 para o navegador trocar o POST por um GET em /entrar.
  const response = new NextResponse(null, {
    status: 303,
    headers: { Location: "/entrar" },
  });
  response.cookies.set(SESSION_COOKIE, "", sessionCookieOptions(0));
  return response;
}

/** Um GET (link, prefetch, imagem de terceiros) nunca desloga: volta ao painel. */
export function GET() {
  return new NextResponse(null, {
    status: 303,
    headers: { Location: "/painel" },
  });
}
