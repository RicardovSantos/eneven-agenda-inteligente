import { expect, it } from "vitest";
import { billingInvoices, billingSubscriptions } from "@/db/schema";
import { getBillingOverview } from "@/server/billing/queries";
import { seedTenant } from "../helpers/agenda-fixtures";
import { createTestDb } from "../helpers/test-db";

it("mostra ao estabelecimento somente suas faturas", async () => {
  const db = await createTestDb();
  const a = await seedTenant(db);
  const b = await seedTenant(db);
  const [subscription] = await db.insert(billingSubscriptions).values({ tenantId: a.id, planId: a.planId, checkoutUrl: "https://www.mercadopago.com.br/checkout" }).returning();
  await db.insert(billingInvoices).values({ tenantId: a.id, subscriptionId: subscription.id, providerId: "fatura-teste", providerStatus: "pending", amountCents: 3990 });
  const first = await getBillingOverview(db, a.id);
  const second = await getBillingOverview(db, b.id);
  expect(first.invoices).toHaveLength(1);
  expect(first.invoices[0].amountCents).toBe(3990);
  expect(second.invoices).toHaveLength(0);
  expect(first.pendingCheckoutUrl).toBe("https://www.mercadopago.com.br/checkout");
  expect(second.pendingCheckoutUrl).toBeNull();
  expect(first.available.length).toBeGreaterThan(0);
});
