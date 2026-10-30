import { getDb } from "@/db/client";
import { safeEqual } from "@/server/auth/signed-cookie";
import { testBillingConfig } from "@/server/billing/test-config";
import { processTestBillingNotices, sendTestBillingNotice } from "@/server/billing/test-notices";

export const dynamic = "force-dynamic";

/** Somente para e-mail de teste explicitamente configurado; produção fica bloqueada. */
export async function POST(request: Request) {
  if (process.env.NODE_ENV === "production") return new Response("Não disponível", { status: 503 });
  const secret = process.env.CRON_SECRET;
  if (!secret) return new Response("Não configurado", { status: 503 });
  if (!safeEqual(request.headers.get("authorization") ?? "", `Bearer ${secret}`)) return new Response("Não autorizado", { status: 401 });
  const recipient = process.env.BILLING_NOTICE_TEST_RECIPIENT;
  if (!testBillingConfig() || process.env.BILLING_NOTICE_TEST_ENABLED !== "true" || !recipient || !process.env.ZEPTOMAIL_TOKEN) return new Response("Não configurado", { status: 503 });
  return Response.json(await processTestBillingNotices(await getDb(), recipient, sendTestBillingNotice));
}
