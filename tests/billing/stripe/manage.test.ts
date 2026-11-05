import { eq } from "drizzle-orm";
import type Stripe from "stripe";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { auditLog, billingSubscriptions, plans, tenants } from "@/db/schema";
import type { Db } from "@/db/types";
import { cancelStripeSubscription, createStripePortalUrl, updateStripeAmount } from "@/server/billing/stripe/manage";
import { seedPlatformTenant } from "../../helpers/platform-fixtures";
import { createTestDb } from "../../helpers/test-db";

let db: Db;
beforeEach(async () => { db = await createTestDb(); });

async function active() {
  const { tenant, owner } = await seedPlatformTenant(db, { status: "active" });
  const [row] = await db.insert(billingSubscriptions).values({ tenantId: tenant.id, planId: tenant.planId, priceCents: 3990, provider: "stripe", providerId: "sub_1", providerStatus: "authorized" }).returning();
  return { tenant, owner, row };
}

describe("cancelamento na Stripe", () => {
  it("agenda para o fim do período, mantém o acesso até lá e audita", async () => {
    const { tenant, owner, row } = await active();
    const update = vi.fn(async () => ({ id: "sub_1", cancel_at_period_end: true, metadata: { agenda_subscription_id: row.id }, items: { data: [{ current_period_end: 1893456000 }] } }));
    const result = await cancelStripeSubscription(db, { tenantId: tenant.id, ownerUserId: owner.id }, { subscriptions: { update } } as unknown as Stripe);
    expect(update).toHaveBeenCalledWith("sub_1", { cancel_at_period_end: true });
    expect(result.accessUntil?.toISOString()).toBe("2030-01-01T00:00:00.000Z");
    const [saved] = await db.select().from(billingSubscriptions).where(eq(billingSubscriptions.id, row.id));
    expect(saved).toMatchObject({ providerStatus: "cancelled" });
    expect(saved.accessUntil?.toISOString()).toBe("2030-01-01T00:00:00.000Z");
    expect((await db.select().from(auditLog).where(eq(auditLog.action, "billing.subscription_canceled")))).toHaveLength(1);
  });
  it("se a Stripe falhar, nada muda aqui", async () => {
    const { tenant, owner, row } = await active();
    const update = vi.fn(async () => { throw new Error("rede"); });
    await expect(cancelStripeSubscription(db, { tenantId: tenant.id, ownerUserId: owner.id }, { subscriptions: { update } } as unknown as Stripe)).rejects.toThrow(/Não foi possível/);
    expect((await db.select().from(billingSubscriptions).where(eq(billingSubscriptions.id, row.id)))[0].providerStatus).toBe("authorized");
  });
  it("só o dono cancela", async () => {
    const { tenant } = await active();
    const { owner: other } = await seedPlatformTenant(db);
    await expect(cancelStripeSubscription(db, { tenantId: tenant.id, ownerUserId: other.id }, {} as Stripe)).rejects.toThrow(/Acesso indisponível/);
  });
});

describe("valor e portal", () => {
  it("muda o valor sem cobrança proporcional e confere o resultado", async () => {
    const { row } = await active();
    const retrieve = async () => ({ id: "sub_1", metadata: { agenda_subscription_id: row.id }, items: { data: [{ id: "si_1", price: { product: "prod_1" } }] } });
    const update = vi.fn(async () => ({ id: "sub_1", items: { data: [{ price: { unit_amount: 5990, currency: "brl" } }] } }));
    await updateStripeAmount({ subscriptions: { retrieve, update } } as unknown as Stripe, { id: row.id, providerId: "sub_1" }, 5990);
    expect(update).toHaveBeenCalledWith("sub_1", expect.objectContaining({ proration_behavior: "none" }));
  });
  it("recusa alteração não confirmada", async () => {
    const { row } = await active();
    const retrieve = async () => ({ id: "sub_1", metadata: { agenda_subscription_id: row.id }, items: { data: [{ id: "si_1", price: { product: "prod_1" } }] } });
    const update = async () => ({ id: "sub_1", items: { data: [{ price: { unit_amount: 1, currency: "brl" } }] } });
    await expect(updateStripeAmount({ subscriptions: { retrieve, update } } as unknown as Stripe, { id: row.id, providerId: "sub_1" }, 5990)).rejects.toThrow(/não confirmada/);
  });
  it("portal só devolve link https da Stripe", async () => {
    const ok = { billingPortal: { sessions: { create: async () => ({ url: "https://billing.stripe.com/p/session/x" }) } } } as unknown as Stripe;
    expect(await createStripePortalUrl(ok, "cus_1", "https://a.com")).toBe("https://billing.stripe.com/p/session/x");
    const bad = { billingPortal: { sessions: { create: async () => ({ url: "https://evil.com/x" }) } } } as unknown as Stripe;
    await expect(createStripePortalUrl(bad, "cus_1", "https://a.com")).rejects.toThrow();
    await expect(createStripePortalUrl(ok, "bad id", "https://a.com")).rejects.toThrow();
  });
});

describe("troca de plano respeita o provedor da assinatura", () => {
  it("aumento numa assinatura Stripe atualiza na Stripe, não na Mercado Pago", async () => {
    const { changePlan } = await import("@/server/billing/change-plan");
    const { tenant, owner } = await seedPlatformTenant(db, { status: "active", plan: "essencial" });
    const [target] = await db.select().from(plans).where(eq(plans.code, "profissional"));
    const [sub] = await db.insert(billingSubscriptions).values({ tenantId: tenant.id, planId: tenant.planId, priceCents: 3990, provider: "stripe", providerId: "sub_1", providerStatus: "authorized" }).returning();
    const mpFetch = vi.fn();
    // Sem credenciais da Stripe no ambiente de teste a troca é recusada, e nada muda nem chama a Mercado Pago.
    await expect(changePlan(db, { tenantId: tenant.id, ownerUserId: owner.id, planId: target.id }, { accessToken: "x", collectorId: "1", fetcher: mpFetch as unknown as typeof fetch })).rejects.toThrow(/Cobrança não configurada/);
    expect(mpFetch).not.toHaveBeenCalled();
    expect((await db.select().from(tenants).where(eq(tenants.id, tenant.id)))[0].planId).toBe(tenant.planId);
    expect((await db.select().from(billingSubscriptions).where(eq(billingSubscriptions.id, sub.id)))[0].planId).toBe(tenant.planId);
  });
});
