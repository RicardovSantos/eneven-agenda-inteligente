import { eq } from "drizzle-orm";
import { expect, it } from "vitest";
import { billingInvoices, billingSubscriptions, tenants } from "@/db/schema";
import { reconcileDueBillingAccess } from "@/server/billing/reconcile-due-access";
import { seedTenant } from "../helpers/agenda-fixtures";
import { createTestDb } from "../helpers/test-db";

it("detecta vencimento sem novo evento e conserva bloqueio manual", async () => {
  const db = await createTestDb();
  const tenant = await seedTenant(db);
  const blocked = await seedTenant(db);
  const now = new Date("2030-02-10T00:00:00Z");
  const trialEndsAt = new Date("2030-01-01T00:00:00Z");
  await db.update(tenants).set({ status: "active", trialEndsAt }).where(eq(tenants.id, tenant.id));
  await db.update(tenants).set({ status: "read_only", trialEndsAt }).where(eq(tenants.id, blocked.id));
  for (const target of [tenant, blocked]) {
    const [subscription] = await db.insert(billingSubscriptions).values({ tenantId: target.id, planId: target.planId, providerId: target.id, providerStatus: "authorized", providerUpdatedAt: now }).returning();
    await db.insert(billingInvoices).values({ tenantId: target.id, subscriptionId: subscription.id, providerId: target.id, providerStatus: "pending", amountCents: 3990, dueAt: new Date("2030-02-09T00:00:00Z"), invoiceUpdatedAt: now });
  }
  const config = { accessToken: "TEST-example", liveMode: false };
  expect(await reconcileDueBillingAccess(db, config, new Date("2030-02-08T00:00:00Z"))).toMatchObject({ updated: 0, failed: 0 });
  expect(await reconcileDueBillingAccess(db, config, now)).toMatchObject({ updated: 1, failed: 0 });
  expect(await reconcileDueBillingAccess(db, config, now)).toMatchObject({ updated: 0, unchanged: 1 });
  const [stored] = await db.select().from(tenants).where(eq(tenants.id, tenant.id));
  const [manual] = await db.select().from(tenants).where(eq(tenants.id, blocked.id));
  expect(stored.status).toBe("past_due");
  expect(manual.status).toBe("read_only");
  await expect(reconcileDueBillingAccess(db, { accessToken: "live", liveMode: true }, now)).rejects.toThrow();
});
