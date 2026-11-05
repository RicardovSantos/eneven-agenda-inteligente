import { getDb } from "@/db/client";
import { stripeConfig } from "@/server/billing/stripe/config";
import { getStripe } from "@/server/billing/stripe/client";
import { processStripeEvents, recordStripeEvent } from "@/server/billing/stripe/events";

export const dynamic = "force-dynamic";

/**
 * Avisos da Stripe. Só autentica (assinatura sobre o corpo bruto) e guarda o sinal; depois tenta
 * processar na hora, e o ciclo da cobrança repete o que falhar. Os dois modos (teste e real) não se misturam.
 */
export async function POST(request: Request) {
  const config = stripeConfig();
  if (!config) return new Response("Não configurado", { status: 503 });
  const raw = await request.text();
  if (raw.length > 1_000_000) return new Response("Requisição muito grande", { status: 413 });
  const db = await getDb();
  const stripe = getStripe(config);
  const result = await recordStripeEvent(db, stripe, { rawBody: raw, signature: request.headers.get("stripe-signature"), config });
  if (result === "invalid") return new Response("Não autorizado", { status: 400 });
  if (result === "accepted") {
    try {
      await processStripeEvents(db, stripe, config, 5);
    } catch (error) {
      // O aviso já está guardado; o ciclo da cobrança tenta de novo.
      console.warn(`Stripe: processamento imediato falhou: ${error instanceof Error ? error.message : "erro"}`);
    }
  }
  return new Response("Recebido", { status: 200 });
}
