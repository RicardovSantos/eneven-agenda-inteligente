import { getDb } from "@/db/client";
import { recordBillingWebhook } from "@/server/billing/webhook";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  // O processador ainda não existe: não reconhecer notificações em produção.
  if (process.env.NODE_ENV === "production") return new Response("Não disponível", { status: 503 });
  const secret = process.env.MERCADO_PAGO_WEBHOOK_SECRET;
  if (!secret) return new Response("Não configurado", { status: 503 });
  const url = new URL(request.url);
  const dataIds = url.searchParams.getAll("data.id");
  if (dataIds.length !== 1) return new Response("Requisição inválida", { status: 400 });
  const raw = await request.text();
  if (raw.length > 16_384) return new Response("Requisição muito grande", { status: 413 });
  let body: unknown;
  try { body = JSON.parse(raw); } catch { return new Response("Requisição inválida", { status: 400 }); }
  const topic = typeof body === "object" && body !== null && "type" in body ? body.type : undefined;
  const result = await recordBillingWebhook(await getDb(), { signature: request.headers.get("x-signature"), requestId: request.headers.get("x-request-id"), dataId: dataIds[0], secret, topic });
  if (result === "invalid") return new Response("Não autorizado", { status: 401 });
  if (result === "unsupported") return new Response("Evento não suportado", { status: 400 });
  return new Response("Recebido", { status: 200 });
}
