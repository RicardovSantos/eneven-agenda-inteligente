import { getDb } from "@/db/client";
import { getCurrentSession } from "@/server/auth/guard";
import { getChargeStatus } from "@/server/billing/charge-status";
import { billingConfig } from "@/server/billing/mode";
import { getStripe } from "@/server/billing/stripe/client";
import { reconcileStripePayment } from "@/server/billing/stripe/charges";
import { stripeConfig } from "@/server/billing/stripe/config";

export const dynamic = "force-dynamic";
const headers = { "Cache-Control": "private, no-store", "X-Content-Type-Options": "nosniff", "Referrer-Policy": "no-referrer" };

/**
 * Situação de um Pix ou boleto do estabelecimento, para a tela do QR Code perguntar a cada
 * poucos segundos e mostrar "Pix confirmado" na hora. Só o dono do estabelecimento da sessão;
 * a cobrança precisa ser dele (`?id=`), senão responde como se não existisse.
 */
export async function GET(request: Request): Promise<Response> {
  const session = await getCurrentSession();
  if (!session?.tenantId || session.role !== "owner") {
    return Response.json({ ok: false }, { status: 401, headers });
  }
  const id = new URL(request.url).searchParams.get("id") ?? "";
  const config = billingConfig();
  const db = await getDb();
  const stripeSettings = stripeConfig();
  const stripe = stripeSettings ? getStripe(stripeSettings) : null;
  const result = await getChargeStatus(db, session.tenantId, id, {
    config: config?.live ? { accessToken: config.accessToken, collectorId: config.collectorId, liveMode: true } : null,
    stripe: stripe ? (paymentIntentId) => reconcileStripePayment(db, stripe, paymentIntentId) : null,
  });
  return Response.json({ ok: true, ...result }, { headers });
}
