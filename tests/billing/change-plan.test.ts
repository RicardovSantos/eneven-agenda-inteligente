import { eq } from "drizzle-orm";
import { afterEach, describe, expect, it, vi } from "vitest";
import { auditLog, billingInvoices, billingSubscriptions, memberships, plans, professionals, tenants, users } from "@/db/schema";
import { applyScheduledPlanChanges, cancelScheduledPlanChange, changePlan } from "@/server/billing/change-plan";
import { seedTenant } from "../helpers/agenda-fixtures";
import { createTestDb } from "../helpers/test-db";

const TOKEN = "APP_USR-1-2-3-4";
const liveEnv = { NODE_ENV: "production", MERCADO_PAGO_LIVE_MODE: "true", MERCADO_PAGO_ACCESS_TOKEN: TOKEN, MERCADO_PAGO_COLLECTOR_ID: "4" };
afterEach(() => vi.unstubAllEnvs());
const stubLive = () => { for (const [key, value] of Object.entries(liveEnv)) vi.stubEnv(key, value); };

type Db = Awaited<ReturnType<typeof createTestDb>>;

async function setup(db: Db, { subscribed = true, activePros = 1 }: { subscribed?: boolean; activePros?: number } = {}) {
  const [small, mid, big] = await db.select().from(plans).orderBy(plans.sortOrder);
  const tenant = await seedTenant(db);
  await db.update(tenants).set({ status: "active", planId: mid.id }).where(eq(tenants.id, tenant.id));
  const [owner] = await db.insert(users).values({ name: "Dona", email: `d${Math.random()}@example.com`, emailVerifiedAt: new Date() }).returning();
  await db.insert(memberships).values({ tenantId: tenant.id, userId: owner.id, role: "owner" });
  for (let i = 0; i < activePros; i++) await db.insert(professionals).values({ tenantId: tenant.id, name: `P${i}`, active: true });
  let subscription: typeof billingSubscriptions.$inferSelect | undefined;
  if (subscribed) {
    [subscription] = await db.insert(billingSubscriptions).values({ tenantId: tenant.id, planId: mid.id, priceCents: mid.priceCents, providerId: "sub-1", providerStatus: "authorized" }).returning();
    await db.insert(billingInvoices).values({ tenantId: tenant.id, subscriptionId: subscription.id, providerId: "inv", paymentId: "pay", providerStatus: "approved", amountCents: mid.priceCents, dueAt: new Date("2030-01-10T00:00:00Z"), paidAt: new Date("2030-01-10T00:00:00Z") });
  }
  return { tenant, owner, small, mid, big, subscription };
}

const remote = (reference: string, priceCents: number) => ({ id: "sub-1", external_reference: reference, collector_id: 4, status: "authorized", auto_recurring: { frequency: 1, frequency_type: "months", transaction_amount: priceCents / 100, currency_id: "BRL" } });
const planOf = async (db: Db, tenantId: string) => (await db.select().from(tenants).where(eq(tenants.id, tenantId)))[0].planId;
const okFetcher = (reference: string, priceCents: number) => vi.fn(async () => Response.json(remote(reference, priceCents)));
const asFetch = (fn: ReturnType<typeof vi.fn>) => fn as unknown as typeof fetch;

describe("troca de plano", () => {
  it("sem assinatura a troca vale na hora, nos dois sentidos, e abandona o checkout pendente", async () => {
    const db = await createTestDb();
    const s = await setup(db, { subscribed: false });
    await db.insert(billingSubscriptions).values({ tenantId: s.tenant.id, planId: s.mid.id, priceCents: s.mid.priceCents, providerId: "pend", providerStatus: "pending", checkoutUrl: "https://www.mercadopago.com.br/x" });
    expect(await changePlan(db, { tenantId: s.tenant.id, ownerUserId: s.owner.id, planId: s.big.id }, null)).toEqual({ kind: "changed" });
    expect(await planOf(db, s.tenant.id)).toBe(s.big.id);
    expect((await db.select().from(billingSubscriptions))[0]).toMatchObject({ providerStatus: "abandoned", checkoutUrl: null });
    await changePlan(db, { tenantId: s.tenant.id, ownerUserId: s.owner.id, planId: s.small.id }, null);
    expect(await planOf(db, s.tenant.id)).toBe(s.small.id);
  });

  it("aumento libera o plano novo na hora e muda o valor das próximas cobranças na Mercado Pago", async () => {
    stubLive();
    const db = await createTestDb();
    const s = await setup(db);
    const fetcher = okFetcher(s.subscription!.id, s.big.priceCents);
    const result = await changePlan(db, { tenantId: s.tenant.id, ownerUserId: s.owner.id, planId: s.big.id }, { accessToken: TOKEN, collectorId: "4", live: true, fetcher: asFetch(fetcher) });
    expect(result).toEqual({ kind: "changed" });
    const [url, init] = fetcher.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe("https://api.mercadopago.com/preapproval/sub-1");
    expect(init.method).toBe("PUT");
    expect(JSON.parse(String(init.body))).toEqual({ auto_recurring: { transaction_amount: s.big.priceCents / 100, currency_id: "BRL" } });
    expect(await planOf(db, s.tenant.id)).toBe(s.big.id);
    expect((await db.select().from(billingSubscriptions))[0]).toMatchObject({ planId: s.big.id, priceCents: s.big.priceCents });
    expect(await db.select().from(auditLog).where(eq(auditLog.action, "billing.plan_changed"))).toHaveLength(1);
  });

  it("se a Mercado Pago recusar, nada muda aqui", async () => {
    stubLive();
    const db = await createTestDb();
    const s = await setup(db);
    const fetcher = asFetch(vi.fn(async () => new Response("erro", { status: 500 })));
    await expect(changePlan(db, { tenantId: s.tenant.id, ownerUserId: s.owner.id, planId: s.big.id }, { accessToken: TOKEN, collectorId: "4", live: true, fetcher })).rejects.toThrow("Não foi possível alterar");
    expect(await planOf(db, s.tenant.id)).toBe(s.mid.id);
    expect((await db.select().from(billingSubscriptions))[0].priceCents).toBe(s.mid.priceCents);
  });

  it("redução fica marcada para o próximo ciclo e dá para desfazer", async () => {
    const db = await createTestDb();
    const s = await setup(db);
    const result = await changePlan(db, { tenantId: s.tenant.id, ownerUserId: s.owner.id, planId: s.small.id }, null);
    expect(result).toEqual({ kind: "scheduled", effectiveAt: new Date("2030-02-10T00:00:00Z") });
    expect(await planOf(db, s.tenant.id)).toBe(s.mid.id);
    expect((await db.select().from(billingSubscriptions))[0].scheduledPlanId).toBe(s.small.id);
    await cancelScheduledPlanChange(db, { tenantId: s.tenant.id, ownerUserId: s.owner.id });
    expect((await db.select().from(billingSubscriptions))[0].scheduledPlanId).toBeNull();
    await expect(cancelScheduledPlanChange(db, { tenantId: s.tenant.id, ownerUserId: s.owner.id })).rejects.toThrow("Não há troca marcada");
  });

  it("recusa redução quando os profissionais ativos não cabem no plano menor", async () => {
    const db = await createTestDb();
    const s = await setup(db, { subscribed: false, activePros: 5 });
    await expect(changePlan(db, { tenantId: s.tenant.id, ownerUserId: s.owner.id, planId: s.small.id }, null)).rejects.toThrow(/permite até 2/);
    expect(await planOf(db, s.tenant.id)).toBe(s.mid.id);
  });

  it("só o dono troca, não troca para o mesmo plano e não troca com a assinatura pausada", async () => {
    const db = await createTestDb();
    const s = await setup(db);
    const [other] = await db.insert(users).values({ name: "Rec", email: "rec@example.com", emailVerifiedAt: new Date() }).returning();
    await db.insert(memberships).values({ tenantId: s.tenant.id, userId: other.id, role: "reception" });
    await expect(changePlan(db, { tenantId: s.tenant.id, ownerUserId: other.id, planId: s.big.id }, null)).rejects.toThrow("Acesso indisponível");
    await expect(changePlan(db, { tenantId: s.tenant.id, ownerUserId: s.owner.id, planId: s.mid.id }, null)).rejects.toThrow("Plano indisponível");
    await db.update(billingSubscriptions).set({ providerStatus: "paused" }).where(eq(billingSubscriptions.tenantId, s.tenant.id));
    await expect(changePlan(db, { tenantId: s.tenant.id, ownerUserId: s.owner.id, planId: s.big.id }, null)).rejects.toThrow("pausada");
  });
});

describe("aplicar a redução no ciclo", () => {
  it("aplica um dia antes da próxima cobrança, muda o valor na Mercado Pago e o plano aqui", async () => {
    stubLive();
    const db = await createTestDb();
    const s = await setup(db);
    await db.update(billingSubscriptions).set({ scheduledPlanId: s.small.id }).where(eq(billingSubscriptions.id, s.subscription!.id));
    const config = { accessToken: TOKEN, collectorId: "4", live: true, fetcher: asFetch(okFetcher(s.subscription!.id, s.small.priceCents)) };
    expect(await applyScheduledPlanChanges(db, config, new Date("2030-02-05T00:00:00Z"))).toEqual({ applied: 0, canceled: 0, failed: 0 });
    expect(await applyScheduledPlanChanges(db, config, new Date("2030-02-09T12:00:00Z"))).toEqual({ applied: 1, canceled: 0, failed: 0 });
    expect(await planOf(db, s.tenant.id)).toBe(s.small.id);
    expect((await db.select().from(billingSubscriptions))[0]).toMatchObject({ planId: s.small.id, priceCents: s.small.priceCents, scheduledPlanId: null });
    expect(await applyScheduledPlanChanges(db, config, new Date("2030-02-09T13:00:00Z"))).toEqual({ applied: 0, canceled: 0, failed: 0 });
  });

  it("cancela a redução se os profissionais não couberem mais", async () => {
    stubLive();
    const db = await createTestDb();
    const s = await setup(db, { activePros: 3 });
    await db.update(billingSubscriptions).set({ scheduledPlanId: s.small.id }).where(eq(billingSubscriptions.id, s.subscription!.id));
    const fetcher = okFetcher(s.subscription!.id, s.small.priceCents);
    const config = { accessToken: TOKEN, collectorId: "4", live: true, fetcher: asFetch(fetcher) };
    expect(await applyScheduledPlanChanges(db, config, new Date("2030-02-09T12:00:00Z"))).toEqual({ applied: 0, canceled: 1, failed: 0 });
    expect(fetcher).not.toHaveBeenCalled();
    expect(await planOf(db, s.tenant.id)).toBe(s.mid.id);
    expect((await db.select().from(billingSubscriptions))[0].scheduledPlanId).toBeNull();
    expect(await db.select().from(auditLog).where(eq(auditLog.action, "billing.plan_change_canceled"))).toHaveLength(1);
  });

  it("se a Mercado Pago falhar, mantém a redução marcada para tentar de novo", async () => {
    stubLive();
    const db = await createTestDb();
    const s = await setup(db);
    await db.update(billingSubscriptions).set({ scheduledPlanId: s.small.id }).where(eq(billingSubscriptions.id, s.subscription!.id));
    const fetcher = asFetch(vi.fn(async () => new Response("erro", { status: 500 })));
    expect(await applyScheduledPlanChanges(db, { accessToken: TOKEN, collectorId: "4", live: true, fetcher }, new Date("2030-02-09T12:00:00Z"))).toEqual({ applied: 0, canceled: 0, failed: 1 });
    expect(await planOf(db, s.tenant.id)).toBe(s.mid.id);
    expect((await db.select().from(billingSubscriptions))[0].scheduledPlanId).toBe(s.small.id);
  });
});
