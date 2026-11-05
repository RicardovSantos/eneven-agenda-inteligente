import { eq } from "drizzle-orm";
import type Stripe from "stripe";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { auditLog, billingCharges, billingWebhookEvents, tenants } from "@/db/schema";
import type { Db } from "@/db/types";
import { ChargeError } from "@/server/billing/charges";
import { createStripeCharge, mapIntentStatus, reconcileStripePayment } from "@/server/billing/stripe/charges";
import { processStripeEvents } from "@/server/billing/stripe/events";
import { seedPlatformTenant } from "../../helpers/platform-fixtures";
import { createTestDb } from "../../helpers/test-db";

let db: Db;
beforeEach(async () => { db = await createTestDb(); vi.spyOn(console, "warn").mockImplementation(() => {}); });

const PAYER = { name: "Maria da Silva", document: "529.982.247-25", zipCode: "01310-100", street: "Av Paulista", number: "1000", neighborhood: "Bela Vista", city: "São Paulo", state: "SP" };
const png = () => new Response(new Uint8Array([1, 2, 3]), { headers: { "content-type": "image/png" } });

async function setup() {
  const { tenant, owner } = await seedPlatformTenant(db, { status: "trial" });
  return { tenantId: tenant.id, ownerUserId: owner.id, tenant };
}
const fake = (create: ReturnType<typeof vi.fn>) => ({ paymentIntents: { create } }) as unknown as Stripe;

function pixIntent(params: Stripe.PaymentIntentCreateParams) {
  return { id: "pi_pix1", amount: params.amount, currency: "brl", status: "requires_action", metadata: params.metadata,
    next_action: { pix_display_qr_code: { data: "000201PIX", expires_at: 1893456000, hosted_instructions_url: "https://payments.stripe.com/pix/x", image_url_png: "https://qr.stripe.com/x.png" } } };
}

describe("Pix pela Stripe", () => {
  it("cria o PaymentIntent com o valor do plano e guarda QR e copia e cola", async () => {
    const input = await setup();
    const create = vi.fn(async (params: Stripe.PaymentIntentCreateParams) => pixIntent(params));
    await createStripeCharge(db, { ...input, method: "pix" }, fake(create), { fetcher: (async () => png()) as unknown as typeof fetch });
    const [params, opts] = create.mock.calls[0] as unknown as [Stripe.PaymentIntentCreateParams, { idempotencyKey: string }];
    expect(params).toMatchObject({ currency: "brl", confirm: true, allowed_payment_method_types: ["pix"] });
    const [row] = await db.select().from(billingCharges);
    expect(row).toMatchObject({ provider: "stripe", method: "pix", status: "pending", providerPaymentId: "pi_pix1", qrCode: "000201PIX", qrCodeBase64: "AQID" });
    expect(params.amount).toBe(row.amountCents);
    expect(opts.idempotencyKey).toBe(`agenda-charge-${row.id}`);
    expect(params.metadata).toMatchObject({ agenda_charge_id: row.id, agenda_tenant_id: input.tenantId });
  });
  it("sem a imagem do QR ainda guarda o copia e cola", async () => {
    const input = await setup();
    const create = vi.fn(async (params: Stripe.PaymentIntentCreateParams) => pixIntent(params));
    await createStripeCharge(db, { ...input, method: "pix" }, fake(create), { fetcher: (async () => { throw new Error("rede"); }) as unknown as typeof fetch });
    const [row] = await db.select().from(billingCharges);
    expect(row).toMatchObject({ status: "pending", qrCode: "000201PIX", qrCodeBase64: null });
  });
  it("resposta perdida deixa a cobrança incerta e não libera outra", async () => {
    const input = await setup();
    const create = vi.fn(async () => { throw new Error("timeout"); });
    await expect(createStripeCharge(db, { ...input, method: "pix" }, fake(create))).rejects.toBeInstanceOf(ChargeError);
    expect((await db.select().from(billingCharges))[0].status).toBe("uncertain");
    await expect(createStripeCharge(db, { ...input, method: "pix" }, fake(create))).rejects.toThrow(/em aberto/);
    expect(create).toHaveBeenCalledTimes(1);
  });
  it("resposta com valor diferente é recusada", async () => {
    const input = await setup();
    const create = vi.fn(async (params: Stripe.PaymentIntentCreateParams) => ({ ...pixIntent(params), amount: 1 }));
    await expect(createStripeCharge(db, { ...input, method: "pix" }, fake(create))).rejects.toBeInstanceOf(ChargeError);
    expect((await db.select().from(billingCharges))[0].status).toBe("uncertain");
  });
});

describe("boleto pela Stripe", () => {
  it("valida os dados antes de reservar e cria com CPF e endereço", async () => {
    const input = await setup();
    const create = vi.fn(async (params: Stripe.PaymentIntentCreateParams) => ({ id: "pi_bol1", amount: params.amount, currency: "brl", status: "requires_action", metadata: params.metadata,
      next_action: { boleto_display_details: { number: "34191.79001 01043.510047", hosted_voucher_url: "https://payments.stripe.com/boleto/voucher/x", expires_at: 1893456000 } } }));
    await expect(createStripeCharge(db, { ...input, method: "boleto", payer: { ...PAYER, document: "111" } }, fake(create))).rejects.toThrow(/Confira os dados/);
    expect(create).not.toHaveBeenCalled();
    expect(await db.select().from(billingCharges)).toHaveLength(0);
    await createStripeCharge(db, { ...input, method: "boleto", payer: PAYER }, fake(create));
    const [params] = create.mock.calls[0] as unknown as [Stripe.PaymentIntentCreateParams];
    expect(params.allowed_payment_method_types).toEqual(["boleto"]);
    expect(JSON.stringify(params)).toContain("52998224725");
    const [row] = await db.select().from(billingCharges);
    expect(row).toMatchObject({ provider: "stripe", method: "boleto", status: "pending", providerPaymentId: "pi_bol1", barcode: "34191.79001 01043.510047", ticketUrl: "https://payments.stripe.com/boleto/voucher/x" });
  });
  it("recusa link do boleto fora da Stripe", async () => {
    const input = await setup();
    const create = vi.fn(async (params: Stripe.PaymentIntentCreateParams) => ({ id: "pi_bol2", amount: params.amount, currency: "brl", status: "requires_action", metadata: params.metadata,
      next_action: { boleto_display_details: { number: "1", hosted_voucher_url: "https://evil.com/x", expires_at: 1 } } }));
    await expect(createStripeCharge(db, { ...input, method: "boleto", payer: PAYER }, fake(create))).rejects.toBeInstanceOf(ChargeError);
  });
});

describe("conciliação do pagamento avulso", () => {
  async function pending() {
    const input = await setup();
    const create = vi.fn(async (params: Stripe.PaymentIntentCreateParams) => pixIntent(params));
    await createStripeCharge(db, { ...input, method: "pix" }, fake(create), { fetcher: (async () => png()) as unknown as typeof fetch });
    const [charge] = await db.select().from(billingCharges);
    return { ...input, charge };
  }
  const retrieveWith = (charge: { id: string; amountCents: number; tenantId: string }, over: Record<string, unknown> = {}) =>
    ({ paymentIntents: { retrieve: async () => ({ id: "pi_pix1", amount: charge.amountCents, currency: "brl", status: "succeeded", metadata: { agenda_charge_id: charge.id, agenda_tenant_id: charge.tenantId }, latest_charge: { created: 1893000000 }, ...over }) } }) as unknown as Stripe;

  it("pago soma um mês uma única vez e ativa o plano", async () => {
    const { charge, tenant } = await pending();
    const stripe = retrieveWith(charge);
    await reconcileStripePayment(db, stripe, "pi_pix1");
    await reconcileStripePayment(db, stripe, "pi_pix1");
    const [saved] = await db.select().from(billingCharges).where(eq(billingCharges.id, charge.id));
    expect(saved.status).toBe("approved");
    const [t] = await db.select().from(tenants).where(eq(tenants.id, tenant.id));
    expect(t.status).toBe("active");
    expect(t.paidUntil?.getTime()).toBe(saved.periodEnd?.getTime());
    expect(await db.select().from(auditLog).where(eq(auditLog.action, "billing.charge_approved"))).toHaveLength(1);
  });
  it("valor ou estabelecimento diferentes não liberam nada", async () => {
    const { charge, tenant } = await pending();
    await expect(reconcileStripePayment(db, retrieveWith(charge, { amount: 1 }), "pi_pix1")).rejects.toThrow(/não corresponde/);
    await expect(reconcileStripePayment(db, retrieveWith(charge, { metadata: { agenda_charge_id: charge.id, agenda_tenant_id: "00000000-0000-4000-8000-000000000000" } }), "pi_pix1")).rejects.toThrow(/não corresponde/);
    expect((await db.select().from(tenants).where(eq(tenants.id, tenant.id)))[0].paidUntil).toBeNull();
  });
  it("pagamento de fatura de assinatura (sem nossa referência) é ignorado", async () => {
    await pending();
    const stripe = { paymentIntents: { retrieve: async () => ({ id: "pi_outro", metadata: {}, status: "succeeded" }) } } as unknown as Stripe;
    expect(await reconcileStripePayment(db, stripe, "pi_outro")).toBeNull();
  });
  it("expirado libera para gerar outro", async () => {
    const { charge } = await pending();
    await reconcileStripePayment(db, retrieveWith(charge, { status: "requires_payment_method" }), "pi_pix1");
    expect((await db.select().from(billingCharges))[0].status).toBe("expired");
  });
  it("mapeia os estados", () => {
    expect(mapIntentStatus("succeeded")).toBe("approved");
    expect(mapIntentStatus("processing")).toBe("pending");
    expect(mapIntentStatus("requires_action")).toBe("pending");
    expect(mapIntentStatus("canceled")).toBe("cancelled");
  });
  it("o aviso payment_intent.succeeded processa uma vez", async () => {
    const { charge } = await pending();
    await db.insert(billingWebhookEvents).values({ requestId: "evt_pi1", provider: "stripe", topic: "stripe_event", resourceId: "payment_intent.succeeded:pi_pix1" });
    const stripe = retrieveWith(charge);
    expect(await processStripeEvents(db, stripe, { live: false })).toEqual({ processed: 1, failed: 0 });
    expect((await db.select().from(billingCharges))[0].status).toBe("approved");
    expect(await processStripeEvents(db, stripe, { live: false })).toEqual({ processed: 0, failed: 0 });
  });
  it("reembolso de Pix avulso fica registrado sem mexer no acesso", async () => {
    const { charge, tenant } = await pending();
    await reconcileStripePayment(db, retrieveWith(charge), "pi_pix1");
    const { reconcileStripeCharge } = await import("@/server/billing/stripe/reconcile");
    const stripe = { charges: { retrieve: async () => ({ id: "ch_1", disputed: false, refunded: true, amount_refunded: charge.amountCents, payment_intent: "pi_pix1" }) } } as unknown as Stripe;
    await reconcileStripeCharge(db, stripe, "ch_1");
    expect((await db.select().from(billingCharges))[0].status).toBe("refunded");
    expect((await db.select().from(tenants).where(eq(tenants.id, tenant.id)))[0].status).toBe("active");
    expect(await db.select().from(auditLog).where(eq(auditLog.action, "billing.charge_disputed"))).toHaveLength(1);
  });
});
