import { getDb } from "@/db/client";
import { safeEqual } from "@/server/auth/signed-cookie";
import { livePushEnabled, pushVapid } from "@/server/push/mode";
import { processTestPushQueue, testPushSender } from "@/server/push/process-test-queue";

export const dynamic = "force-dynamic";

/** Chamada manual da fila de notificações (teste). Em produção o relógio interno cuida disso, e a rota só responde com o envio real ligado. */
export async function POST(request: Request) {
  if (process.env.NODE_ENV === "production" && !livePushEnabled()) return new Response("Não disponível", { status: 503 });
  const secret = process.env.CRON_SECRET;
  if (!secret) return new Response("Não configurado", { status: 503 });
  if (!safeEqual(request.headers.get("authorization") ?? "", `Bearer ${secret}`)) return new Response("Não autorizado", { status: 401 });
  const vapid = pushVapid();
  if (!vapid || (process.env.PUSH_TEST_ONLY !== "true" && !livePushEnabled())) return new Response("Não configurado", { status: 503 });
  return Response.json(await processTestPushQueue(await getDb(), testPushSender(vapid)));
}
