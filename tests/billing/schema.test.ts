import { expect, it } from "vitest";
import { billingInvoices, billingSubscriptions } from "@/db/schema";
import { withTenant } from "@/server/tenant-db";
import { seedTenant } from "../helpers/agenda-fixtures";
import { createTestDb } from "../helpers/test-db";

it("isola assinatura e fatura e impede vínculos entre estabelecimentos", async () => {
  const db = await createTestDb();
  const a = await seedTenant(db);
  const b = await seedTenant(db);
  const [sub] = await db.insert(billingSubscriptions).values({ tenantId: a.id, planId: a.planId, providerId: "subscription-a" }).returning();
  await db.insert(billingInvoices).values({ tenantId: a.id, subscriptionId: sub.id, providerId: "invoice-a", providerStatus: "pending", amountCents: 3990 });
  expect(await withTenant(db, a.id, (tx) => tx.select().from(billingInvoices))).toHaveLength(1);
  expect(await withTenant(db, b.id, (tx) => tx.select().from(billingInvoices))).toHaveLength(0);
  expect(await withTenant(db, b.id, (tx) => tx.select().from(billingSubscriptions))).toHaveLength(0);
  await expect(db.insert(billingInvoices).values({ tenantId: b.id, subscriptionId: sub.id, providerId: "invoice-b", providerStatus: "pending", amountCents: 3990 })).rejects.toThrow();
  await expect(withTenant(db, a.id, (tx) => tx.insert(billingInvoices).values({ tenantId: a.id, subscriptionId: sub.id, providerId: "invoice-c", providerStatus: "paid", amountCents: 1 }))).rejects.toThrow();
});
