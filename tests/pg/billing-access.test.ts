import { eq } from "drizzle-orm";
import { afterAll, beforeEach, expect, it } from "vitest";
import { auditLog, billingInvoices, billingSubscriptions, tenants } from "@/db/schema";
import { reconcileTestBillingAccess } from "@/server/billing/reconcile-access";
import { seedTenant } from "../helpers/agenda-fixtures";
import { connectPg } from "./pg-db";

const pg = connectPg();
beforeEach(() => pg.truncate());
afterAll(() => pg.close());

it("serializa alterações simultâneas de acesso e registra uma auditoria", async () => {
  const tenant = await seedTenant(pg.db);
  const now = new Date("2030-02-10T00:00:00Z");
  await pg.db.update(tenants).set({ status: "active", trialEndsAt: new Date("2030-01-01T00:00:00Z") }).where(eq(tenants.id, tenant.id));
  const [subscription] = await pg.db.insert(billingSubscriptions).values({ tenantId: tenant.id, planId: tenant.planId, providerId: "sub-pg", providerStatus: "authorized", providerUpdatedAt: now }).returning();
  await pg.db.insert(billingInvoices).values({ tenantId: tenant.id, subscriptionId: subscription.id, providerId: "invoice-pg", providerStatus: "pending", amountCents: 3990, dueAt: new Date("2030-02-01T00:00:00Z"), invoiceUpdatedAt: now });
  const results = await Promise.all([reconcileTestBillingAccess(pg.db, tenant.id, now), reconcileTestBillingAccess(pg.db, tenant.id, now)]);
  expect(results.sort()).toEqual(["unchanged", "updated"]);
  expect(await pg.db.select().from(auditLog).where(eq(auditLog.tenantId, tenant.id))).toHaveLength(1);
});
