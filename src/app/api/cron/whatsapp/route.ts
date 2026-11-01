import { getDb } from "@/db/client";
import { safeEqual } from "@/server/auth/signed-cookie";
import { runWhatsAppCycle } from "@/server/whatsapp/cycle";

export const dynamic = "force-dynamic";

/**
 * Chamada manual/externa (teste ou agendador de fora). O app já tem um relógio
 * interno que faz o mesmo a cada 5 minutos. Sem segredo configurado, fica desligada.
 */
export async function POST(request: Request) {
  const secret = process.env.CRON_SECRET;
  if (!secret) return new Response("Serviço não configurado", { status: 503 });
  const auth = request.headers.get("authorization") ?? "";
  if (!safeEqual(auth, `Bearer ${secret}`)) return new Response("Não autorizado", { status: 401 });
  return Response.json(await runWhatsAppCycle(await getDb(), new Date()));
}
