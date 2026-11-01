import { eq } from "drizzle-orm";
import { afterEach, describe, expect, it, vi } from "vitest";
import { auditLog, billingInvoices, billingNotices, billingSubscriptions, memberships, tenants, users } from "@/db/schema";
import { applyCancelledExpiry } from "@/server/billing/cancel-expiry";
import { cancelSubscription } from "@/server/billing/cancel-subscription";
import { runBillingCycle } from "@/server/billing/cycle";
import { assertBillingConfig, billingAccessEnabled, billingConfig, liveBillingEnabled } from "@/server/billing/mode";
import { addOneMonthUtc, paidThrough } from "@/server/billing/paid-through";
import { reconcileBillingAccess } from "@/server/billing/reconcile-access";
import { reconcileSubscription } from "@/server/billing/reconcile-subscription";
import { processBillingNotices } from "@/server/billing/test-notices";
import { seedTenant } from "../helpers/agenda-fixtures";
import { createTestDb } from "../helpers/test-db";

const state = vi.hoisted(() => ({ db: undefined as unknown }));
vi.mock("@/db/client", () => ({ getDb: async () => state.db }));

const TOKEN = "APP_USR-1-2-3-4";
const live = { NODE_ENV: "production", MERCADO_PAGO_LIVE_MODE: "true", MERCADO_PAGO_ACCESS_TOKEN: TOKEN, MERCADO_PAGO_COLLECTOR_ID: "4", APP_URL: "https://agenda.exemplo.com" };

afterEach(() => vi.unstubAllEnvs());
const stubLive = () => { for (const [key, value] of Object.entries(live)) vi.stubEnv(key, value); };

describe("modo da cobrança", () => {
  it("a cobrança real só liga em produção, com o interruptor, token APP_USR- e vendedor numérico", () => {
    expect(liveBillingEnabled(live)).toBe(true);
    expect(liveBillingEnabled({ ...live, NODE_ENV: "development" })).toBe(false);
    expect(liveBillingEnabled({ ...live, MERCADO_PAGO_LIVE_MODE: "false" })).toBe(false);
    expect(liveBillingEnabled({ ...live, MERCADO_PAGO_ACCESS_TOKEN: "TEST-1" })).toBe(false);
    expect(liveBillingEnabled({ ...live, MERCADO_PAGO_COLLECTOR_ID: "abc" })).toBe(false);
    expect(liveBillingEnabled({ ...live, MERCADO_PAGO_SANDBOX: "true" })).toBe(false);
  });

  it("billingConfig devolve real em produção, sandbox fora dela e nada sem APP_URL https", () => {
    expect(billingConfig(live)).toMatchObject({ live: true, collectorId: "4", backUrl: "https://agenda.exemplo.com/painel/configuracoes/assinatura" });
    expect(billingConfig({ ...live, APP_URL: "http://agenda.exemplo.com" })).toBeNull();
    expect(billingConfig({ ...live, APP_URL: undefined })).toBeNull();
    const sandbox = { NODE_ENV: "development", MERCADO_PAGO_LIVE_MODE: "false", MERCADO_PAGO_ACCESS_TOKEN: "TEST-1", MERCADO_PAGO_COLLECTOR_ID: "4", APP_URL: "https://x.exemplo.com" };
    expect(billingConfig(sandbox)).toMatchObject({ live: false });
    // Token real fora de produção, sem a liberação do sandbox, não vira configuração.
    expect(billingConfig({ ...sandbox, MERCADO_PAGO_ACCESS_TOKEN: TOKEN })).toBeNull();
  });

  it("assertBillingConfig e billingAccessEnabled recusam modo trocado", () => {
    expect(() => assertBillingConfig({ accessToken: TOKEN, live: true }, live)).not.toThrow();
    expect(() => assertBillingConfig({ accessToken: "outro", live: true }, live)).toThrow();
    expect(() => assertBillingConfig({ accessToken: TOKEN, live: true }, { ...live, MERCADO_PAGO_LIVE_MODE: "false" })).toThrow();
    expect(() => assertBillingConfig({ accessToken: "TEST-1" }, live)).toThrow();
    expect(billingAccessEnabled({ accessToken: TOKEN, liveMode: true }, live)).toBe(true);
    expect(billingAccessEnabled({ accessToken: TOKEN, liveMode: false }, live)).toBe(false);
    expect(billingAccessEnabled({ accessToken: "TEST-1", liveMode: false }, { NODE_ENV: "development" })).toBe(true);
    expect(billingAccessEnabled({ accessToken: "TEST-1", liveMode: false }, { NODE_ENV: "production" })).toBe(false);
  });
});

describe("fim do período pago", () => {
  it("soma um mês mantendo o dia e respeita o último dia do mês", () => {
    expect(addOneMonthUtc(new Date("2030-01-15T10:00:00Z")).toISOString()).toBe("2030-02-15T10:00:00.000Z");
    expect(addOneMonthUtc(new Date("2030-01-31T10:00:00Z")).toISOString()).toBe("2030-02-28T10:00:00.000Z");
    expect(addOneMonthUtc(new Date("2030-12-20T00:00:00Z")).toISOString()).toBe("2031-01-20T00:00:00.000Z");
  });

  it("usa a última fatura aprovada e ignora as não pagas", () => {
    const base = { paidAt: null };
    expect(paidThrough([])).toBeNull();
    expect(paidThrough([{ ...base, providerStatus: "pending", dueAt: new Date("2030-03-01T00:00:00Z") }])).toBeNull();
    expect(paidThrough([
      { ...base, providerStatus: "approved", dueAt: new Date("2030-01-10T00:00:00Z") },
      { ...base, providerStatus: "approved", dueAt: new Date("2030-02-10T00:00:00Z") },
      { ...base, providerStatus: "rejected", dueAt: new Date("2030-03-10T00:00:00Z") },
    ])?.toISOString()).toBe("2030-03-10T00:00:00.000Z");
  });
});

async function seedPaidTenant(db: Awaited<ReturnType<typeof createTestDb>>, ownerEmail = "dona@example.com", suffix = "1") {
  const tenant = await seedTenant(db);
  const [owner] = await db.insert(users).values({ name: "Dona", email: ownerEmail, emailVerifiedAt: new Date() }).returning();
  await db.insert(memberships).values({ tenantId: tenant.id, userId: owner.id, role: "owner" });
  await db.update(tenants).set({ status: "active" }).where(eq(tenants.id, tenant.id));
  const [subscription] = await db.insert(billingSubscriptions).values({ tenantId: tenant.id, planId: tenant.planId, priceCents: 3990, providerId: `sub-${suffix}`, providerStatus: "authorized", providerUpdatedAt: new Date("2030-01-01T00:00:00Z") }).returning();
  await db.insert(billingInvoices).values({ tenantId: tenant.id, subscriptionId: subscription.id, providerId: `inv-${suffix}`, paymentId: `pay-${suffix}`, providerStatus: "approved", amountCents: 3990, dueAt: new Date("2030-01-10T00:00:00Z"), paidAt: new Date("2030-01-10T00:00:00Z"), providerUpdatedAt: new Date("2030-01-10T00:00:00Z"), invoiceUpdatedAt: new Date("2030-01-10T00:00:00Z") });
  return { tenant, owner, subscription };
}

const remote = (subscriptionId: string, status: string) => ({ id: "sub-1", external_reference: subscriptionId, collector_id: 4, status, last_modified: "2030-01-20T00:00:00Z", auto_recurring: { frequency: 1, frequency_type: "months", transaction_amount: 39.9, currency_id: "BRL" } });

describe("cancelamento", () => {
  it("cancela na Mercado Pago, guarda até quando vai o acesso e registra a auditoria", async () => {
    stubLive();
    const db = await createTestDb();
    const { tenant, owner, subscription } = await seedPaidTenant(db);
    const fetcher = vi.fn(async () => Response.json(remote(subscription.id, "cancelled"))) as unknown as typeof fetch;
    const result = await cancelSubscription(db, { tenantId: tenant.id, ownerUserId: owner.id }, { accessToken: TOKEN, collectorId: "4", live: true, fetcher });
    expect(result.accessUntil?.toISOString()).toBe("2030-02-10T00:00:00.000Z");
    const [call] = (fetcher as unknown as ReturnType<typeof vi.fn>).mock.calls;
    expect(String(call[0])).toBe("https://api.mercadopago.com/preapproval/sub-1");
    expect(call[1]).toMatchObject({ method: "PUT", body: JSON.stringify({ status: "cancelled" }) });
    const [saved] = await db.select().from(billingSubscriptions).where(eq(billingSubscriptions.id, subscription.id));
    expect(saved).toMatchObject({ providerStatus: "cancelled" });
    expect(saved.accessUntil?.toISOString()).toBe("2030-02-10T00:00:00.000Z");
    expect(await db.select().from(auditLog).where(eq(auditLog.action, "billing.subscription_canceled"))).toHaveLength(1);
    // O acesso não é cortado na hora.
    expect((await db.select().from(tenants).where(eq(tenants.id, tenant.id)))[0].status).toBe("active");
  });

  it("recusa quem não é dono, assinatura que não está ativa e resposta que não confirma", async () => {
    stubLive();
    const db = await createTestDb();
    const { tenant, owner, subscription } = await seedPaidTenant(db);
    const [other] = await db.insert(users).values({ name: "Recepção", email: "rec@example.com", emailVerifiedAt: new Date() }).returning();
    await db.insert(memberships).values({ tenantId: tenant.id, userId: other.id, role: "reception" });
    const ok = vi.fn(async () => Response.json(remote(subscription.id, "cancelled"))) as unknown as typeof fetch;
    const config = { accessToken: TOKEN, collectorId: "4", live: true, fetcher: ok };
    await expect(cancelSubscription(db, { tenantId: tenant.id, ownerUserId: other.id }, config)).rejects.toThrow("Acesso indisponível");
    await expect(cancelSubscription(db, { tenantId: tenant.id, ownerUserId: owner.id }, { ...config, fetcher: (async () => Response.json(remote(subscription.id, "authorized"))) as typeof fetch })).rejects.toThrow("não confirmado");
    await expect(cancelSubscription(db, { tenantId: tenant.id, ownerUserId: owner.id }, { ...config, fetcher: (async () => new Response("erro", { status: 500 })) as typeof fetch })).rejects.toThrow("Não foi possível cancelar");
    expect((await db.select().from(billingSubscriptions).where(eq(billingSubscriptions.id, subscription.id)))[0].providerStatus).toBe("authorized");
    await db.update(billingSubscriptions).set({ providerStatus: "paused" }).where(eq(billingSubscriptions.id, subscription.id));
    await expect(cancelSubscription(db, { tenantId: tenant.id, ownerUserId: owner.id }, config)).rejects.toThrow("Não há assinatura ativa");
  });

  it("recusa credencial que não combina com o modo", async () => {
    stubLive();
    const db = await createTestDb();
    const { tenant, owner } = await seedPaidTenant(db);
    await expect(cancelSubscription(db, { tenantId: tenant.id, ownerUserId: owner.id }, { accessToken: TOKEN, collectorId: "4", live: false })).rejects.toThrow();
  });
});

describe("assinatura cancelada pela Mercado Pago", () => {
  it("entende o status 'cancelled' (dois l) e guarda até quando vai o acesso", async () => {
    const db = await createTestDb();
    const { subscription, tenant } = await seedPaidTenant(db);
    const config = { accessToken: "x", collectorId: "4", fetcher: (async () => Response.json(remote(subscription.id, "cancelled"))) as typeof fetch };
    expect(await reconcileSubscription(db, "sub-1", config)).toBe("updated");
    const [saved] = await db.select().from(billingSubscriptions).where(eq(billingSubscriptions.id, subscription.id));
    expect(saved.providerStatus).toBe("cancelled");
    expect(saved.accessUntil?.toISOString()).toBe("2030-02-10T00:00:00.000Z");
    // Assinatura cancelada não faz a conciliação de acesso pedir revisão nem mudar o estado.
    expect(await reconcileBillingAccess(db, tenant.id, new Date("2030-01-25T00:00:00Z"))).toBe("unchanged");
  });
});

describe("fim do acesso de assinatura cancelada", () => {
  it("passa a em atraso com carência vencida só depois do período pago e só uma vez", async () => {
    const db = await createTestDb();
    const { tenant, subscription } = await seedPaidTenant(db);
    const accessUntil = new Date("2030-02-10T00:00:00Z");
    await db.update(billingSubscriptions).set({ providerStatus: "cancelled", accessUntil }).where(eq(billingSubscriptions.id, subscription.id));
    expect(await applyCancelledExpiry(db, new Date("2030-02-09T23:59:00Z"))).toEqual({ expired: 0 });
    expect(await applyCancelledExpiry(db, new Date("2030-02-10T00:01:00Z"))).toEqual({ expired: 1 });
    const [saved] = await db.select().from(tenants).where(eq(tenants.id, tenant.id));
    expect(saved.status).toBe("past_due");
    expect(saved.pastDueAt?.toISOString()).toBe("2030-02-03T00:00:00.000Z");
    expect(await applyCancelledExpiry(db, new Date("2030-03-01T00:00:00Z"))).toEqual({ expired: 0 });
    expect(await db.select().from(auditLog).where(eq(auditLog.action, "billing.cancel_effective"))).toHaveLength(1);
  });

  it("não mexe em quem assinou de novo, nem em bloqueio manual", async () => {
    const db = await createTestDb();
    const { tenant, subscription } = await seedPaidTenant(db);
    await db.update(billingSubscriptions).set({ providerStatus: "cancelled", accessUntil: new Date("2030-02-10T00:00:00Z") }).where(eq(billingSubscriptions.id, subscription.id));
    await db.insert(billingSubscriptions).values({ tenantId: tenant.id, planId: tenant.planId, priceCents: 3990, providerId: "sub-2", providerStatus: "authorized" });
    expect(await applyCancelledExpiry(db, new Date("2030-03-01T00:00:00Z"))).toEqual({ expired: 0 });
    await db.update(tenants).set({ status: "read_only" }).where(eq(tenants.id, tenant.id));
    expect(await applyCancelledExpiry(db, new Date("2030-03-01T00:00:00Z"))).toEqual({ expired: 0 });
  });
});

describe("avisos de atraso aos donos", () => {
  it("só avisa quem tem fatura não paga (não quem acabou de cancelar) e uma vez por atraso", async () => {
    const db = await createTestDb();
    const unpaid = await seedPaidTenant(db, "a@example.com", "a");
    const canceled = await seedPaidTenant(db, "b@example.com", "b");
    const now = new Date("2030-03-01T00:00:00Z");
    for (const item of [unpaid, canceled]) await db.update(tenants).set({ status: "past_due", pastDueAt: new Date("2030-02-20T00:00:00Z") }).where(eq(tenants.id, item.tenant.id));
    await db.insert(billingInvoices).values({ tenantId: unpaid.tenant.id, subscriptionId: unpaid.subscription.id, providerId: "inv-late", providerStatus: "pending", amountCents: 3990, dueAt: new Date("2030-02-20T00:00:00Z"), invoiceUpdatedAt: now });
    const send = vi.fn(async () => undefined);
    expect(await processBillingNotices(db, send, { now, requireUnpaidInvoice: true })).toEqual({ sent: 1, uncertain: 0 });
    expect(send).toHaveBeenCalledWith(unpaid.tenant.id);
    expect(await processBillingNotices(db, send, { now, requireUnpaidInvoice: true })).toEqual({ sent: 0, uncertain: 0 });
    expect(await db.select().from(billingNotices)).toHaveLength(1);
  });
});

describe("ciclo e rota", () => {
  it("o ciclo da cobrança não faz nada fora do modo real", async () => {
    const db = await createTestDb();
    expect(await runBillingCycle(db)).toBeNull();
  });

  it("o webhook em produção só responde com a cobrança real ligada", async () => {
    state.db = await createTestDb();
    vi.stubEnv("MERCADO_PAGO_WEBHOOK_SECRET", "segredo");
    vi.stubEnv("NODE_ENV", "production");
    const { POST } = await import("@/app/api/webhooks/mercado-pago/route");
    const request = () => new Request("https://agenda.exemplo.com/api/webhooks/mercado-pago?data.id=1", { method: "POST", body: "{}" });
    expect((await POST(request())).status).toBe(503);
    stubLive();
    vi.stubEnv("MERCADO_PAGO_WEBHOOK_SECRET", "segredo");
    // Ligada, a rota chega a conferir a assinatura (sem ela: 401) em vez de responder 503.
    expect((await POST(request())).status).toBe(401);
  });
});
