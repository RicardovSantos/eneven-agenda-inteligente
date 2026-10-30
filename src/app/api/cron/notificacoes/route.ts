import { getDb } from "@/db/client";
import { safeEqual } from "@/server/auth/signed-cookie";
import { processTestPushQueue, testPushSender } from "@/server/push/process-test-queue";

export const dynamic = "force-dynamic";

/** Testes manuais com dispositivos de teste; produção permanece desligada. */
export async function POST(request: Request) {
  if (process.env.NODE_ENV === "production") return new Response("Não disponível", { status: 503 });
  const secret = process.env.CRON_SECRET;
  if (!secret) return new Response("Não configurado", { status: 503 });
  if (!safeEqual(request.headers.get("authorization") ?? "", `Bearer ${secret}`)) return new Response("Não autorizado", { status: 401 });
  const { PUSH_VAPID_PUBLIC_KEY: publicKey, PUSH_VAPID_PRIVATE_KEY: privateKey, PUSH_VAPID_SUBJECT: subject, PUSH_TEST_ONLY: testOnly } = process.env;
  if (testOnly !== "true" || !publicKey || !privateKey || !subject) return new Response("Não configurado", { status: 503 });
  return Response.json(await processTestPushQueue(await getDb(), testPushSender({ publicKey, privateKey, subject })));
}
