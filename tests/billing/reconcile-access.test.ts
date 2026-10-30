import { eq } from "drizzle-orm";
import { expect, it } from "vitest";
import { auditLog, billingInvoices, billingPaymentAttempts, billingSubscriptions, tenants } from "@/db/schema";
import { reconcileTestBillingAccess } from "@/server/billing/reconcile-access";
import { seedTenant } from "../helpers/agenda-fixtures";
import { createTestDb } from "../helpers/test-db";

it("aplica atraso idempotente, restaura após pagamento e respeita bloqueio manual", async () => {
  const db = await createTestDb();
  const tenant = await seedTenant(db);
  const now = new Date("2030-02-10T00:00:00Z");
  const trialEnd = new Date("2030-02-03T00:00:00Z");
  const due = new Date("2030-02-01T00:00:00Z");
  await db.update(tenants).set({ status: "trial", trialEndsAt: trialEnd }).where(eq(tenants.id, tenant.id));
  const [subscription] = await db.insert(billingSubscriptions).values({ tenantId: tenant.id, planId: tenant.planId, providerId: "sub", providerStatus: "authorized", providerUpdatedAt: now }).returning();
  const [invoice] = await db.insert(billingInvoices).values({ tenantId: tenant.id, subscriptionId: subscription.id, providerId: "invoice", providerStatus: "pending", amountCents: 3990, dueAt: due, invoiceUpdatedAt: now }).returning();
  expect(await reconcileTestBillingAccess(db, tenant.id, new Date("2030-02-02T00:00:00Z"))).toBe("unchanged");
  expect(await reconcileTestBillingAccess(db, tenant.id, now)).toBe("updated");
  expect(await reconcileTestBillingAccess(db, tenant.id, now)).toBe("unchanged");
  let [stored] = await db.select().from(tenants).where(eq(tenants.id, tenant.id));
  expect(stored.status).toBe("past_due");
  expect(stored.pastDueAt).toEqual(trialEnd);
  expect(await db.select().from(auditLog).where(eq(auditLog.tenantId, tenant.id))).toHaveLength(1);
  await db.update(billingInvoices).set({ providerStatus: "approved", paymentId: "payment", providerUpdatedAt: now, paidAt: now }).where(eq(billingInvoices.id, invoice.id));
  expect(await reconcileTestBillingAccess(db, tenant.id, now)).toBe("updated");
  [stored] = await db.select().from(tenants).where(eq(tenants.id, tenant.id));
  expect(stored.status).toBe("active");
  expect(stored.pastDueAt).toBeNull();
  await db.update(tenants).set({ status: "read_only" }).where(eq(tenants.id, tenant.id));
  expect(await reconcileTestBillingAccess(db, tenant.id, now)).toBe("unchanged");
  [stored] = await db.select().from(tenants).where(eq(tenants.id, tenant.id));
  expect(stored.status).toBe("read_only");
});

it("não reativa diante de outra tentativa estornada ou assinatura adicional pendente", async () => {
  const db = await createTestDb();
  const tenant = await seedTenant(db);
  const now = new Date("2030-02-10T00:00:00Z");
  await db.update(tenants).set({ status: "past_due", pastDueAt: now }).where(eq(tenants.id, tenant.id));
  const [subscription] = await db.insert(billingSubscriptions).values({ tenantId: tenant.id, planId: tenant.planId, providerId: "sub", providerStatus: "authorized", providerUpdatedAt: now }).returning();
  const [invoice] = await db.insert(billingInvoices).values({ tenantId: tenant.id, subscriptionId: subscription.id, providerId: "invoice", providerStatus: "approved", amountCents: 3990, dueAt: now, invoiceUpdatedAt: now, paymentId: "approved", providerUpdatedAt: now, paidAt: now }).returning();
  await db.insert(billingPaymentAttempts).values({ tenantId: tenant.id, invoiceId: invoice.id, paymentId: "refunded", status: "refunded", providerUpdatedAt: now });
  expect(await reconcileTestBillingAccess(db, tenant.id, now)).toBe("review");
  await db.delete(billingPaymentAttempts).where(eq(billingPaymentAttempts.paymentId, "refunded"));
  await db.insert(billingSubscriptions).values({ tenantId: tenant.id, planId: tenant.planId, providerStatus: "pending" });
  expect(await reconcileTestBillingAccess(db, tenant.id, now)).toBe("review");
  const [stored] = await db.select().from(tenants).where(eq(tenants.id, tenant.id));
  expect(stored.status).toBe("past_due");
});

it("exige dados confirmados e mantém acesso quando há reembolso ou assinatura incerta", async () => {
  const db = await createTestDb();
  const tenant = await seedTenant(db);
  const now = new Date("2030-02-10T00:00:00Z");
  const [subscription] = await db.insert(billingSubscriptions).values({ tenantId: tenant.id, planId: tenant.planId, providerId: "sub", providerStatus: "authorized" }).returning();
  const [invoice] = await db.insert(billingInvoices).values({ tenantId: tenant.id, subscriptionId: subscription.id, providerId: "invoice", providerStatus: "refunded", amountCents: 3990, dueAt: now, invoiceUpdatedAt: now }).returning();
  expect(await reconcileTestBillingAccess(db, tenant.id, now)).toBe("review");
  await db.update(billingSubscriptions).set({ providerUpdatedAt: now }).where(eq(billingSubscriptions.id, subscription.id));
  expect(await reconcileTestBillingAccess(db, tenant.id, now)).toBe("review");
  await db.update(billingInvoices).set({ providerStatus: "approved" }).where(eq(billingInvoices.id, invoice.id));
  expect(await reconcileTestBillingAccess(db, tenant.id, now)).toBe("review");
  expect(await db.select().from(auditLog).where(eq(auditLog.tenantId, tenant.id))).toHaveLength(0);
});
