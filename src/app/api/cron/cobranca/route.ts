import { getDb } from "@/db/client";
import { safeEqual } from "@/server/auth/signed-cookie";
import { processPaymentEvents } from "@/server/billing/process-events";

export const dynamic = "force-dynamic";

/** Ambiente de desenvolvimento/teste: não habilitar cobrança real antes da revisão. */
export async function POST(request: Request) {
  if (process.env.NODE_ENV === "production") return new Response("Não disponível", { status: 503 });
  const secret = process.env.CRON_SECRET;
  if (!secret) return new Response("Não configurado", { status: 503 });
  if (!safeEqual(request.headers.get("authorization") ?? "", `Bearer ${secret}`)) return new Response("Não autorizado", { status: 401 });
  const accessToken = process.env.MERCADO_PAGO_ACCESS_TOKEN;
  const collectorId = process.env.MERCADO_PAGO_COLLECTOR_ID;
  const mode = process.env.MERCADO_PAGO_LIVE_MODE;
  if (!accessToken || !collectorId || (mode !== "true" && mode !== "false")) return new Response("Não configurado", { status: 503 });
  return Response.json(await processPaymentEvents(await getDb(), { accessToken, collectorId, liveMode: mode === "true" }));
}
