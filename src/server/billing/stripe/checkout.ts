import { and, eq } from "drizzle-orm";
import type Stripe from "stripe";
import { billingSubscriptions } from "@/db/schema";
import type { Db } from "@/db/types";
import { reserveSubscription } from "../create-subscription";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const CHECKOUT_HOST = /(^|\.)stripe\.com$/;

/** Chaves que ligam o objeto da Stripe à assinatura daqui; as mesmas vão no checkout e na assinatura. */
export const META_SUBSCRIPTION = "agenda_subscription_id";
export const META_TENANT = "agenda_tenant_id";

/**
 * Cria o checkout hospedado da Stripe para uma NOVA assinatura por cartão. O valor sai do plano no nosso
 * banco a cada sessão (`price_data`): nenhum Price da Stripe vira fonte de verdade do preço. Mesma
 * proteção do Mercado Pago: reserva antes, trava por estabelecimento e, se a resposta se perder, a
 * tentativa fica "incerta" (nunca cria outra sozinha). O retorno do checkout não libera o plano:
 * quem libera é o aviso da Stripe, já conferido.
 */
export async function createStripeSubscription(
  db: Db,
  input: { tenantId: string; planId: string; ownerUserId: string; payerEmail?: string; returnUrl: string },
  stripe: Stripe,
): Promise<{ checkoutUrl: string }> {
  if (!UUID.test(input.tenantId) || !UUID.test(input.planId) || !UUID.test(input.ownerUserId)) throw new Error("Dados inválidos.");
  let back: URL;
  try { back = new URL(input.returnUrl); } catch { throw new Error("Endereço de retorno inválido."); }
  if (back.protocol !== "https:" || back.username || back.password) throw new Error("Endereço de retorno inválido.");
  const email = input.payerEmail?.trim();
  if (email && (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || email.length > 254)) throw new Error("Dados inválidos.");

  const reserved = await reserveSubscription(db, input, "stripe");
  const metadata = { [META_SUBSCRIPTION]: reserved.id, [META_TENANT]: input.tenantId };
  const success = new URL(back); success.searchParams.set("stripe", "ok");
  const cancel = new URL(back); cancel.searchParams.set("stripe", "cancelado");
  try {
    const session = await stripe.checkout.sessions.create({
      mode: "subscription",
      allowed_payment_method_types: ["card"],
      client_reference_id: reserved.id,
      ...(email ? { customer_email: email } : {}),
      line_items: [{ quantity: 1, price_data: { currency: "brl", unit_amount: reserved.priceCents, recurring: { interval: "month" }, product_data: { name: `Eneven - ${reserved.name}`, description: reserved.slug } } }],
      metadata,
      subscription_data: { metadata },
      success_url: success.toString(),
      cancel_url: cancel.toString(),
      locale: "pt-BR",
    }, { idempotencyKey: `agenda-checkout-${reserved.id}` });
    let checkout: URL | null = null;
    try { checkout = session.url ? new URL(session.url) : null; } catch { checkout = null; }
    if (!session.id.startsWith("cs_") || session.client_reference_id !== reserved.id || session.mode !== "subscription" || !checkout || checkout.protocol !== "https:" || !CHECKOUT_HOST.test(checkout.hostname)) throw new Error("Resposta inválida.");
    const updated = await db.update(billingSubscriptions).set({ providerId: session.id, providerStatus: "pending", checkoutUrl: checkout.toString() })
      .where(and(eq(billingSubscriptions.id, reserved.id), eq(billingSubscriptions.providerStatus, "creating"))).returning({ id: billingSubscriptions.id });
    if (!updated.length) throw new Error("Tentativa indisponível.");
    return { checkoutUrl: checkout.toString() };
  } catch (error) {
    console.warn(`Stripe: checkout não criado (${reserved.id}): ${error instanceof Error ? error.message : "erro"}`);
    // Mesmo um tempo esgotado pode ter criado a sessão: fica "incerta" até alguém conferir.
    await db.update(billingSubscriptions).set({ providerStatus: "uncertain" }).where(and(eq(billingSubscriptions.id, reserved.id), eq(billingSubscriptions.providerStatus, "creating")));
    throw new Error("Não foi possível confirmar a criação; revise a ocorrência antes de tentar novamente.");
  }
}
