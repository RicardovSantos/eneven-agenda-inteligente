import { beforeEach, describe, expect, it } from "vitest";
import { billingInvoices, billingPaymentAttempts, billingSubscriptions } from "@/db/schema";
import type { Db } from "@/db/types";
import { getTenantBillingIds } from "@/server/platform/billing-ids";
import { listPlatformTenants } from "@/server/platform/tenants";
import { createTestDb } from "../helpers/test-db";
import { NOW, seedPlatformTenant } from "../helpers/platform-fixtures";

let db: Db;
beforeEach(async () => {
  db = await createTestDb();
});

async function withBilling(name: string) {
  const { tenant } = await seedPlatformTenant(db, { name });
  const [subscription] = await db
    .insert(billingSubscriptions)
    .values({ tenantId: tenant.id, planId: tenant.planId, priceCents: 3990, providerId: `mp-${name.toLowerCase()}-123`, providerStatus: "cancelled" })
    .returning();
  const [invoice] = await db
    .insert(billingInvoices)
    .values({ tenantId: tenant.id, subscriptionId: subscription.id, providerId: `inv-${name}`, providerStatus: "rejected", amountCents: 3990, dueAt: NOW })
    .returning();
  await db.insert(billingPaymentAttempts).values({ paymentId: `pay-${name}-777`, tenantId: tenant.id, invoiceId: invoice.id, status: "rejected", providerUpdatedAt: NOW });
  return { tenant, subscription };
}

describe("códigos da cobrança do estabelecimento", () => {
  it("lista referência, id da assinatura no Mercado Pago e pagamentos, só do estabelecimento pedido", async () => {
    const a = await withBilling("Alfa");
    await withBilling("Beta");
    const ids = await getTenantBillingIds(db, a.tenant.id);
    expect(ids.subscriptions).toEqual([expect.objectContaining({ reference: a.subscription.id, mercadoPagoId: "mp-alfa-123", status: "cancelled", priceCents: 3990 })]);
    expect(ids.payments).toEqual([expect.objectContaining({ paymentId: "pay-Alfa-777", status: "rejected", amountCents: 3990 })]);
  });

  it("sem cobrança: listas vazias", async () => {
    const { tenant } = await seedPlatformTenant(db, { name: "Vazio" });
    expect(await getTenantBillingIds(db, tenant.id)).toEqual({ subscriptions: [], payments: [] });
  });
});

describe("busca na lista por código", () => {
  it("acha pelo id do estabelecimento, pela referência, pelo id da assinatura e pelo id do pagamento", async () => {
    const a = await withBilling("Alfa");
    await withBilling("Beta");
    const find = async (query: string) => (await listPlatformTenants(db, { page: 1, now: NOW, query })).items.map((i) => i.name);

    expect(await find(a.tenant.id)).toEqual(["Alfa"]);
    expect(await find(a.subscription.id)).toEqual(["Alfa"]);
    expect(await find("mp-alfa-123")).toEqual(["Alfa"]);
    expect(await find("pay-Alfa-777")).toEqual(["Alfa"]);
    expect(await find("pay-Beta")).toEqual(["Beta"]);
    expect(await find("codigo-que-nao-existe")).toEqual([]);
  });
});
