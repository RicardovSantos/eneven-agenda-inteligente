import { getDb } from "@/db/client";
import { safeEqual } from "@/server/auth/signed-cookie";
import { processPaymentEvents } from "@/server/billing/process-events";
import { reconcileDueBillingAccess } from "@/server/billing/reconcile-due-access";
import { billingAccessEnabled, liveBillingEnabled } from "@/server/billing/mode";

export const dynamic = "force-dynamic";

/** Chamada manual/externa do ciclo de cobrança. Em produção só responde com a cobrança real ligada. */
export async function POST(request: Request) {
  if (process.env.NODE_ENV === "production" && !liveBillingEnabled()) return new Response("Não disponível", { status: 503 });
  const secret = process.env.CRON_SECRET;
  if (!secret) return new Response("Não configurado", { status: 503 });
  if (!safeEqual(request.headers.get("authorization") ?? "", `Bearer ${secret}`)) return new Response("Não autorizado", { status: 401 });
  const accessToken = process.env.MERCADO_PAGO_ACCESS_TOKEN;
  const collectorId = process.env.MERCADO_PAGO_COLLECTOR_ID;
  const mode = process.env.MERCADO_PAGO_LIVE_MODE;
  if (!accessToken || !collectorId || (mode !== "true" && mode !== "false")) return new Response("Não configurado", { status: 503 });
  const db = await getDb();
  const config = { accessToken, collectorId, liveMode: mode === "true" };
  const events = await processPaymentEvents(db, config);
  if (billingAccessEnabled(config)) {
    const due = await reconcileDueBillingAccess(db, config);
    return Response.json({ ...events, due });
  }
  return Response.json(events);
}
