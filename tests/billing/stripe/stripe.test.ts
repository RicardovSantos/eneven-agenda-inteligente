import { eq } from "drizzle-orm";
import Stripe from "stripe";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { billingInvoices, billingSubscriptions, billingWebhookEvents } from "@/db/schema";
import type { Db } from "@/db/types";
import { createStripeSubscription } from "@/server/billing/stripe/checkout";
import { processStripeEvents, recordStripeEvent } from "@/server/billing/stripe/events";
import { mapSubscriptionStatus } from "@/server/billing/stripe/reconcile";
import { seedPlatformTenant } from "../../helpers/platform-fixtures";
import { createTestDb } from "../../helpers/test-db";

const SECRET = "whsec_testsecret";
const CONFIG = { secretKey: "sk_test_x", webhookSecret: SECRET, live: false };
const real = new Stripe("sk_test_x");

function signed(event: object, secret = SECRET) {
  const payload = JSON.stringify(event);
  return { rawBody: payload, signature: real.webhooks.generateTestHeaderString({ payload, secret }) };
}
const evt = (id: string, type: string, object: Record<string, unknown>, livemode = false) => ({ id, object: "event", type, livemode, data: { object } });

let db: Db;
beforeEach(async () => { db = await createTestDb(); });

describe("assinatura do webhook da Stripe", () => {
  it("aceita o aviso assinado e guarda só o sinal", async () => {
    const { rawBody, signature } = signed(evt("evt_1", "invoice.paid", { id: "in_1" }));
    expect(await recordStripeEvent(db, real, { rawBody, signature, config: CONFIG })).toBe("accepted");
    const [row] = await db.select().from(billingWebhookEvents);
    expect(row).toMatchObject({ requestId: "evt_1", provider: "stripe", topic: "stripe_event", resourceId: "invoice.paid:in_1" });
  });
  it("recusa assinatura errada, ausente ou corpo adulterado", async () => {
    const good = signed(evt("evt_2", "invoice.paid", { id: "in_1" }));
    expect(await recordStripeEvent(db, real, { ...good, signature: null, config: CONFIG })).toBe("invalid");
    expect(await recordStripeEvent(db, real, { ...signed(evt("evt_2", "invoice.paid", { id: "in_1" }), "whsec_outro"), config: CONFIG })).toBe("invalid");
    expect(await recordStripeEvent(db, real, { rawBody: good.rawBody.replace("in_1", "in_2"), signature: good.signature, config: CONFIG })).toBe("invalid");
    expect(await db.select().from(billingWebhookEvents)).toHaveLength(0);
  });
  it("ignora tipos que não usa e eventos do outro modo", async () => {
    expect(await recordStripeEvent(db, real, { ...signed(evt("evt_3", "customer.created", { id: "cus_1" })), config: CONFIG })).toBe("ignored");
    expect(await recordStripeEvent(db, real, { ...signed(evt("evt_4", "invoice.paid", { id: "in_1" }, true)), config: CONFIG })).toBe("ignored");
    expect(await db.select().from(billingWebhookEvents)).toHaveLength(0);
  });
  it("o mesmo aviso repetido não duplica", async () => {
    const input = { ...signed(evt("evt_5", "invoice.paid", { id: "in_1" })), config: CONFIG };
    await recordStripeEvent(db, real, input);
    await recordStripeEvent(db, real, input);
    expect(await db.select().from(billingWebhookEvents)).toHaveLength(1);
  });
});

describe("mapeamento de estados", () => {
  it.each([
    ["active", false, "authorized"], ["trialing", false, "authorized"], ["past_due", false, "authorized"], ["unpaid", false, "authorized"], ["paused", false, "authorized"],
    ["incomplete", false, "pending"], ["canceled", false, "cancelled"], ["incomplete_expired", false, "cancelled"], ["active", true, "cancelled"],
  ] as const)("%s (cancel_at_period_end=%s) → %s", (status, cancel, expected) => {
    expect(mapSubscriptionStatus({ status, cancel_at_period_end: cancel })).toBe(expected);
  });
});

describe("checkout da Stripe", () => {
  async function owner() {
    const { tenant, owner } = await seedPlatformTenant(db);
    return { tenantId: tenant.id, planId: tenant.planId, ownerUserId: owner.id };
  }
  const fakeStripe = (create: ReturnType<typeof vi.fn>) => ({ checkout: { sessions: { create } } }) as unknown as Stripe;

  it("cria a sessão com valor do plano, só cartão, metadados e chave de idempotência", async () => {
    const input = await owner();
    const create = vi.fn(async (params: Stripe.Checkout.SessionCreateParams) => ({ id: "cs_test_1", mode: "subscription", client_reference_id: params.client_reference_id, url: "https://checkout.stripe.com/c/pay/cs_test_1" }));
    const { checkoutUrl } = await createStripeSubscription(db, { ...input, payerEmail: "a@b.com", returnUrl: "https://agenda.exemplo.com/painel/configuracoes/assinatura" }, fakeStripe(create));
    expect(checkoutUrl).toBe("https://checkout.stripe.com/c/pay/cs_test_1");
    const [params, opts] = create.mock.calls[0] as unknown as [Stripe.Checkout.SessionCreateParams, { idempotencyKey: string }];
    expect(params.mode).toBe("subscription");
    expect(params.allowed_payment_method_types).toEqual(["card"]);
    expect(params.line_items?.[0].price_data).toMatchObject({ currency: "brl", recurring: { interval: "month" } });
    expect(params.metadata).toMatchObject({ agenda_tenant_id: input.tenantId });
    const [row] = await db.select().from(billingSubscriptions);
    expect(row).toMatchObject({ provider: "stripe", providerStatus: "pending", providerId: "cs_test_1" });
    expect(opts.idempotencyKey).toBe(`agenda-checkout-${row.id}`);
    expect(params.client_reference_id).toBe(row.id);
  });
  it("se a resposta falhar, fica incerta e não libera nova tentativa sozinha", async () => {
    const input = await owner();
    const create = vi.fn(async () => { throw new Error("timeout"); });
    await expect(createStripeSubscription(db, { ...input, returnUrl: "https://agenda.exemplo.com/x" }, fakeStripe(create))).rejects.toThrow(/revise a ocorrência/);
    const [row] = await db.select().from(billingSubscriptions);
    expect(row.providerStatus).toBe("uncertain");
    await expect(createStripeSubscription(db, { ...input, returnUrl: "https://agenda.exemplo.com/x" }, fakeStripe(create))).rejects.toThrow();
    expect(create).toHaveBeenCalledTimes(1);
  });
  it("recusa retorno que não seja https", async () => {
    const input = await owner();
    await expect(createStripeSubscription(db, { ...input, returnUrl: "http://x.com" }, fakeStripe(vi.fn()))).rejects.toThrow();
    expect(await db.select().from(billingSubscriptions)).toHaveLength(0);
  });
});

describe("processamento dos avisos", () => {
  async function stripeSub() {
    const { tenant, owner } = await seedPlatformTenant(db);
    const [row] = await db.insert(billingSubscriptions).values({ tenantId: tenant.id, planId: tenant.planId, priceCents: 3990, provider: "stripe", providerId: "cs_test_1", providerStatus: "pending", checkoutUrl: "https://checkout.stripe.com/x" }).returning();
    return { tenant, owner, row };
  }
  const sub = (row: { id: string; tenantId: string }, over: Record<string, unknown> = {}) => ({
    id: "sub_1", status: "active", cancel_at_period_end: false, customer: "cus_1", metadata: { agenda_subscription_id: row.id, agenda_tenant_id: row.tenantId },
    items: { data: [{ current_period_end: 1893456000, price: { currency: "brl", unit_amount: 3990, recurring: { interval: "month", interval_count: 1 } } }] }, ...over,
  });
  async function queue(id: string, resource: string) {
    await db.insert(billingWebhookEvents).values({ requestId: id, provider: "stripe", topic: "stripe_event", resourceId: resource });
  }

  it("assinatura ativa vira autorizada e o aviso fica processado", async () => {
    const { row } = await stripeSub();
    const retrieve = vi.fn(async () => sub(row));
    await queue("evt_a", "customer.subscription.updated:sub_1");
    const result = await processStripeEvents(db, { subscriptions: { retrieve } } as unknown as Stripe, { live: false });
    expect(result).toEqual({ processed: 1, failed: 0 });
    const [saved] = await db.select().from(billingSubscriptions).where(eq(billingSubscriptions.id, row.id));
    expect(saved).toMatchObject({ providerStatus: "authorized", providerId: "sub_1", providerCustomerId: "cus_1", checkoutUrl: null });
    // Reprocessar não faz nada (idempotente).
    expect(await processStripeEvents(db, { subscriptions: { retrieve } } as unknown as Stripe, { live: false })).toEqual({ processed: 0, failed: 0 });
  });
  it("valor diferente do plano não é aceito e o aviso volta para nova tentativa", async () => {
    const { row } = await stripeSub();
    const bad = sub(row, { items: { data: [{ current_period_end: 1, price: { currency: "brl", unit_amount: 100, recurring: { interval: "month", interval_count: 1 } } }] } });
    await queue("evt_b", "customer.subscription.updated:sub_1");
    vi.spyOn(console, "warn").mockImplementation(() => {});
    const result = await processStripeEvents(db, { subscriptions: { retrieve: async () => bad } } as unknown as Stripe, { live: false });
    expect(result).toEqual({ processed: 0, failed: 1 });
    const [ev] = await db.select().from(billingWebhookEvents).where(eq(billingWebhookEvents.requestId, "evt_b"));
    expect(ev.processedAt).toBeNull();
    expect(ev.attempts).toBe(1);
    expect(ev.nextAttemptAt).not.toBeNull();
    const [saved] = await db.select().from(billingSubscriptions).where(eq(billingSubscriptions.id, row.id));
    expect(saved.providerStatus).toBe("pending");
  });
  it("fatura paga chegando antes do checkout liga a assinatura e registra a fatura (fora de ordem)", async () => {
    const { row } = await stripeSub();
    const invoice = { id: "in_1", status: "paid", currency: "brl", total: 3990, attempt_count: 1, created: 1893000000, due_date: null, status_transitions: { paid_at: 1893000100, finalized_at: 1893000000 },
      parent: { subscription_details: { subscription: "sub_1" } }, payments: { data: [{ payment: { payment_intent: "pi_1" } }] } };
    await queue("evt_c", "invoice.paid:in_1");
    const stripe = { invoices: { retrieve: async () => invoice }, subscriptions: { retrieve: async () => sub(row) } } as unknown as Stripe;
    expect(await processStripeEvents(db, stripe, { live: false })).toEqual({ processed: 1, failed: 0 });
    const [inv] = await db.select().from(billingInvoices);
    expect(inv).toMatchObject({ providerId: "in_1", providerStatus: "approved", paymentId: "pi_1", amountCents: 3990 });
    const [saved] = await db.select().from(billingSubscriptions).where(eq(billingSubscriptions.id, row.id));
    expect(saved.providerStatus).toBe("authorized");
    // Aviso atrasado de fatura em aberto não desfaz o pagamento.
    await queue("evt_d", "invoice.finalized:in_1");
    const open = { ...invoice, status: "open", status_transitions: {} };
    await processStripeEvents(db, { invoices: { retrieve: async () => open }, subscriptions: { retrieve: async () => sub(row) } } as unknown as Stripe, { live: false });
    expect((await db.select().from(billingInvoices))[0].providerStatus).toBe("approved");
  });
  it("fatura com valor diferente do plano é recusada", async () => {
    const { row } = await stripeSub();
    const invoice = { id: "in_2", status: "paid", currency: "brl", total: 1, attempt_count: 1, created: 1, due_date: null, status_transitions: {}, parent: { subscription_details: { subscription: "sub_1" } }, payments: { data: [] } };
    await queue("evt_e", "invoice.paid:in_2");
    vi.spyOn(console, "warn").mockImplementation(() => {});
    const result = await processStripeEvents(db, { invoices: { retrieve: async () => invoice }, subscriptions: { retrieve: async () => sub(row) } } as unknown as Stripe, { live: false });
    expect(result.failed).toBe(1);
    expect(await db.select().from(billingInvoices)).toHaveLength(0);
  });
  it("checkout expirado encerra a tentativa e libera o link", async () => {
    const { row } = await stripeSub();
    await queue("evt_f", "checkout.session.expired:cs_test_1");
    const stripe = { checkout: { sessions: { retrieve: async () => ({ id: "cs_test_1", client_reference_id: row.id, status: "expired", subscription: null }) } } } as unknown as Stripe;
    expect(await processStripeEvents(db, stripe, { live: false })).toEqual({ processed: 1, failed: 0 });
    const [saved] = await db.select().from(billingSubscriptions).where(eq(billingSubscriptions.id, row.id));
    expect(saved).toMatchObject({ providerStatus: "cancelled", checkoutUrl: null });
  });
  it("não mexe em assinatura de outro provedor", async () => {
    const { tenant } = await seedPlatformTenant(db);
    const [mp] = await db.insert(billingSubscriptions).values({ tenantId: tenant.id, planId: tenant.planId, priceCents: 3990, providerId: "mp-1", providerStatus: "authorized" }).returning();
    await queue("evt_g", "customer.subscription.updated:sub_1");
    vi.spyOn(console, "warn").mockImplementation(() => {});
    const result = await processStripeEvents(db, { subscriptions: { retrieve: async () => sub({ id: mp.id, tenantId: tenant.id }) } } as unknown as Stripe, { live: false });
    expect(result.failed).toBe(1);
    const [saved] = await db.select().from(billingSubscriptions).where(eq(billingSubscriptions.id, mp.id));
    expect(saved).toMatchObject({ provider: "mercadopago", providerId: "mp-1", providerStatus: "authorized" });
  });
});
