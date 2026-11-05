import { and, eq } from "drizzle-orm";
import type Stripe from "stripe";
import { billingCharges } from "@/db/schema";
import type { Db } from "@/db/types";
import { parseBoletoPayer } from "../charge-payer";
import { applyChargeState, ChargeError, reserveCharge, type ChargeMethod } from "../charges";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
export const META_CHARGE = "agenda_charge_id";
export const META_CHARGE_TENANT = "agenda_tenant_id";
/** O Pix da Stripe vale por 1 dia (limite seguro do provedor); o boleto, 10 dias, como no Mercado Pago. */
const PIX_SECONDS = 86_400;
const BOLETO_DAYS = 10;
const STRIPE_HOST = /(^|\.)stripe\.com$/;

function safeStripeUrl(value: unknown): string | null {
  if (typeof value !== "string") return null;
  try {
    const url = new URL(value);
    return url.protocol === "https:" && !url.username && !url.password && !url.port && STRIPE_HOST.test(url.hostname) ? url.toString() : null;
  } catch {
    return null;
  }
}

/** Baixa o QR (PNG) da Stripe e guarda em base64, igual ao do Mercado Pago. Sem ele a tela ainda mostra o copia e cola. */
async function fetchQrBase64(url: string | null, fetcher: typeof fetch): Promise<string | null> {
  const safe = safeStripeUrl(url);
  if (!safe) return null;
  try {
    const response = await fetcher(safe, { redirect: "error", signal: AbortSignal.timeout(5_000) });
    if (!response.ok || !(response.headers.get("content-type") ?? "").startsWith("image/png")) return null;
    const bytes = Buffer.from(await response.arrayBuffer());
    return bytes.length > 0 && bytes.length < 60_000 ? bytes.toString("base64") : null;
  } catch {
    return null;
  }
}

/**
 * Gera o Pix ou o boleto do mês pela Stripe (PaymentIntent avulso). Mesmas regras da Mercado Pago:
 * valor do plano no servidor, uma cobrança em aberto por estabelecimento, e resposta perdida deixa a
 * cobrança "incerta" (a Stripe pode ter criado). O pagamento só libera o mês depois de conferido na Stripe.
 */
export async function createStripeCharge(
  db: Db,
  input: { tenantId: string; ownerUserId: string; method: ChargeMethod; payer?: Record<string, unknown> },
  stripe: Stripe,
  options: { now?: Date; fetcher?: typeof fetch } = {},
): Promise<{ id: string }> {
  const now = options.now ?? new Date();
  if (!UUID.test(input.tenantId) || !UUID.test(input.ownerUserId) || (input.method !== "pix" && input.method !== "boleto")) throw new ChargeError("Dados inválidos.");
  let boletoPayer: Extract<ReturnType<typeof parseBoletoPayer>, { ok: true }>["payer"] | null = null;
  if (input.method === "boleto") {
    const parsed = parseBoletoPayer(input.payer ?? {});
    if (!parsed.ok) throw new ChargeError("Confira os dados do boleto.", parsed.errors);
    boletoPayer = parsed.payer;
  }
  const reserved = await reserveCharge(db, input, "stripe");
  const metadata = { [META_CHARGE]: reserved.id, [META_CHARGE_TENANT]: input.tenantId };
  try {
    const base = { amount: reserved.amountCents, currency: "brl", confirm: true, description: `Eneven - ${reserved.planName} · ${reserved.slug}`, metadata } as const;
    const intent = input.method === "pix"
      ? await stripe.paymentIntents.create({
        ...base, allowed_payment_method_types: ["pix"], payment_method_data: { type: "pix", billing_details: { email: reserved.email } },
        payment_method_options: { pix: { expires_after_seconds: PIX_SECONDS } },
      }, { idempotencyKey: `agenda-charge-${reserved.id}` })
      : await stripe.paymentIntents.create({
        ...base, allowed_payment_method_types: ["boleto"],
        payment_method_data: {
          type: "boleto",
          boleto: { tax_id: boletoPayer!.document },
          billing_details: {
            name: boletoPayer!.name, email: reserved.email,
            address: { line1: `${boletoPayer!.street}, ${boletoPayer!.number}`, line2: boletoPayer!.neighborhood, city: boletoPayer!.city, state: boletoPayer!.state, postal_code: boletoPayer!.zipCode, country: "BR" },
          },
        },
        payment_method_options: { boleto: { expires_after_days: BOLETO_DAYS } },
      }, { idempotencyKey: `agenda-charge-${reserved.id}` });

    if (!intent.id.startsWith("pi_") || intent.amount !== reserved.amountCents || intent.currency !== "brl" || intent.metadata?.[META_CHARGE] !== reserved.id || intent.status !== "requires_action") throw new Error("Resposta inválida.");
    const fetcher = options.fetcher ?? fetch;
    let values: { qrCode: string | null; qrCodeBase64: string | null; ticketUrl: string | null; barcode: string | null; expiresAt: Date };
    if (input.method === "pix") {
      const pix = intent.next_action?.pix_display_qr_code;
      if (!pix?.data) throw new Error("Resposta inválida.");
      values = {
        qrCode: pix.data.slice(0, 2000), qrCodeBase64: await fetchQrBase64(pix.image_url_png ?? null, fetcher),
        ticketUrl: safeStripeUrl(pix.hosted_instructions_url), barcode: null,
        expiresAt: pix.expires_at ? new Date(pix.expires_at * 1000) : new Date(now.getTime() + PIX_SECONDS * 1000),
      };
    } else {
      const voucher = intent.next_action?.boleto_display_details;
      const ticketUrl = safeStripeUrl(voucher?.hosted_voucher_url);
      if (!voucher || !ticketUrl) throw new Error("Resposta inválida.");
      values = {
        qrCode: null, qrCodeBase64: null, ticketUrl, barcode: voucher.number ? voucher.number.slice(0, 100) : null,
        expiresAt: voucher.expires_at ? new Date(voucher.expires_at * 1000) : new Date(now.getTime() + BOLETO_DAYS * 86_400_000),
      };
    }
    const updated = await db.update(billingCharges).set({ status: "pending", providerPaymentId: intent.id, ...values })
      .where(and(eq(billingCharges.id, reserved.id), eq(billingCharges.status, "creating"))).returning({ id: billingCharges.id });
    if (!updated.length) throw new Error("Tentativa indisponível.");
    return { id: reserved.id };
  } catch (error) {
    console.warn(`Stripe: cobrança avulsa não criada (${reserved.id}): ${error instanceof Error ? error.message : "erro"}`);
    await db.update(billingCharges).set({ status: "uncertain" }).where(and(eq(billingCharges.id, reserved.id), eq(billingCharges.status, "creating")));
    throw new ChargeError("Não foi possível confirmar a criação do pagamento. Tente de novo em alguns minutos.");
  }
}

/** PaymentIntent da Stripe → estado interno. `requires_payment_method` depois de criado = expirou/recusou. */
export function mapIntentStatus(status: Stripe.PaymentIntent.Status): "approved" | "pending" | "expired" | "cancelled" {
  if (status === "succeeded") return "approved";
  if (status === "canceled") return "cancelled";
  if (status === "requires_payment_method") return "expired";
  return "pending"; // requires_action, processing, requires_confirmation, requires_capture
}

/**
 * Atualiza a cobrança avulsa com o estado oficial na Stripe (consultado agora, não o do aviso).
 * Devolve `null` se o pagamento não é uma cobrança avulsa da Agenda (ex.: pagamento de uma fatura de assinatura).
 */
export async function reconcileStripePayment(db: Db, stripe: Stripe, paymentIntentId: string, now = new Date()): Promise<{ tenantId: string } | null> {
  if (!/^pi_[A-Za-z0-9]{1,120}$/.test(paymentIntentId)) throw new Error("Identificador inválido.");
  const intent = await stripe.paymentIntents.retrieve(paymentIntentId, { expand: ["latest_charge"] });
  const chargeId = intent.metadata?.[META_CHARGE];
  if (intent.id !== paymentIntentId || !chargeId) return null;
  if (!UUID.test(chargeId)) throw new Error("Referência de cobrança inválida.");
  const mapped = mapIntentStatus(intent.status);
  let paidAt: Date | null = null;
  if (mapped === "approved") {
    const latest = typeof intent.latest_charge === "object" && intent.latest_charge ? intent.latest_charge : null;
    paidAt = new Date((latest?.created ?? Math.floor(now.getTime() / 1000)) * 1000);
  }
  let tenantId: string | null = null;
  await applyChargeState(db, {
    chargeId, paymentId: paymentIntentId, provider: "stripe", mapped, updatedAt: now, paidAt,
    verify: (charge) => {
      tenantId = charge.tenantId;
      return intent.currency === "brl" && intent.amount === charge.amountCents && intent.metadata?.[META_CHARGE_TENANT] === charge.tenantId;
    },
  }, now);
  return tenantId ? { tenantId } : null;
}

/** A tela do dono chama isto para mostrar o pagamento sem esperar o aviso nem o relógio do servidor. */
export async function refreshOpenStripeCharge(db: Db, tenantId: string, stripe: Stripe): Promise<"updated" | "unchanged" | "none"> {
  const [open] = await db.select({ paymentId: billingCharges.providerPaymentId }).from(billingCharges)
    .where(and(eq(billingCharges.tenantId, tenantId), eq(billingCharges.provider, "stripe"), eq(billingCharges.status, "pending"))).limit(1);
  if (!open?.paymentId) return "none";
  try {
    await reconcileStripePayment(db, stripe, open.paymentId);
    return "updated";
  } catch (error) {
    console.warn(`Cobrança avulsa da Stripe não atualizada (${open.paymentId}): ${error instanceof Error ? error.message : "erro"}`);
    return "unchanged";
  }
}
