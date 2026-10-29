import { NextResponse, type NextRequest } from "next/server";
import { getDb } from "@/db/client";
import { handleMetaWebhookPost } from "@/server/whatsapp/webhook";

export const dynamic = "force-dynamic";

/**
 * Handshake de verificação do Webhook da Meta (Cloud API).
 * Chamado pelo painel da Meta Developers ao configurar a URL de retorno.
 */
export async function GET(request: NextRequest) {
  const { searchParams } = request.nextUrl;
  const mode = searchParams.get("hub.mode");
  const token = searchParams.get("hub.verify_token");
  const challenge = searchParams.get("hub.challenge");

  const expectedToken = process.env.WHATSAPP_VERIFY_TOKEN;

  if (mode === "subscribe" && token && expectedToken && token === expectedToken) {
    return new NextResponse(challenge ?? "", {
      status: 200,
      headers: { "Content-Type": "text/plain" },
    });
  }

  return new NextResponse("Forbidden", { status: 403 });
}

/**
 * Recebimento de eventos da Meta (status de mensagens e respostas de clientes).
 */
export async function POST(request: NextRequest) {
  const signature = request.headers.get("x-hub-signature-256");
  const rawBody = await request.text();
  const secret = process.env.WHATSAPP_APP_SECRET;

  const db = await getDb();
  const result = await handleMetaWebhookPost(db, rawBody, signature, secret);

  if (!result.ok) {
    return new NextResponse(result.error ?? "Unauthorized", { status: 401 });
  }

  return new NextResponse("EVENT_RECEIVED", { status: 200 });
}
