import { eq } from "drizzle-orm";
import { expect, it } from "vitest";
import { billingInvoicePaymentLinks, billingInvoices, billingPaymentAttempts, billingSubscriptions, billingWebhookEvents, tenants } from "@/db/schema";
import { reconcilePayment } from "@/server/billing/reconcile-payment";
import { processPaymentEvents } from "@/server/billing/process-events";
import { seedTenant } from "../helpers/agenda-fixtures";
import { createTestDb } from "../helpers/test-db";

it("concilia somente pagamento correspondente e não regride eventos antigos", async () => {
  const db = await createTestDb();
  const tenant = await seedTenant(db);
  const [subscription] = await db.insert(billingSubscriptions).values({ tenantId: tenant.id, planId: tenant.planId }).returning();
  const [invoice] = await db.insert(billingInvoices).values({ tenantId: tenant.id, subscriptionId: subscription.id, providerId: "invoice-1", providerStatus: "pending", amountCents: 3990 }).returning();
  const payment = { id: 123, external_reference: invoice.id, collector_id: 42, live_mode: false, currency_id: "BRL", transaction_amount: 39.9, status: "approved", date_last_updated: "2030-01-02T00:00:00Z", date_approved: "2030-01-02T00:00:00Z" };
  const config = { accessToken: "test", collectorId: "42", liveMode: false, fetcher: async () => new Response(JSON.stringify(payment)) };
  await expect(reconcilePayment(db, "123", { ...config, collectorId: "999" })).rejects.toThrow("não corresponde");
  expect(await reconcilePayment(db, "123", config)).toBe("updated");
  expect(await reconcilePayment(db, "123", config)).toBe("unchanged");
  const old = { ...payment, status: "pending", date_last_updated: "2030-01-01T00:00:00Z" };
  expect(await reconcilePayment(db, "123", { ...config, fetcher: async () => new Response(JSON.stringify(old)) })).toBe("unchanged");
  const ambiguous = { ...payment, status: "refunded", date_approved: null };
  await expect(reconcilePayment(db, "123", { ...config, fetcher: async () => new Response(JSON.stringify(ambiguous)) })).rejects.toThrow("ambígua");
  const [stored] = await db.select().from(billingInvoices).where(eq(billingInvoices.id, invoice.id));
  expect(stored.providerStatus).toBe("approved");
  expect(stored.paymentId).toBe("123");
  const [unchanged] = await db.select().from(tenants).where(eq(tenants.id, tenant.id));
  expect(unchanged.status).toBe(tenant.status);
});

it("processa eventos repetidos e preserva pagamento aprovado ao registrar tentativa recusada", async () => {
  const db = await createTestDb();
  const tenant = await seedTenant(db);
  const [subscription] = await db.insert(billingSubscriptions).values({ tenantId: tenant.id, planId: tenant.planId }).returning();
  const [invoice] = await db.insert(billingInvoices).values({ tenantId: tenant.id, subscriptionId: subscription.id, providerId: "invoice-multiple", providerStatus: "pending", amountCents: 3990 }).returning();
  const base = { external_reference: invoice.id, collector_id: 42, live_mode: false, currency_id: "BRL", transaction_amount: 39.9 };
  const records: Record<string, object> = {
    "100": { ...base, id: 100, status: "approved", date_last_updated: "2030-01-02T00:00:00Z", date_approved: "2030-01-02T00:00:00Z" },
    "101": { ...base, id: 101, status: "rejected", date_last_updated: "2030-01-03T00:00:00Z" },
  };
  const fetcher: typeof fetch = async (url) => new Response(JSON.stringify(records[String(url).split("/").pop()!]));
  const config = { accessToken: "test", collectorId: "42", liveMode: false, fetcher };
  await db.insert(billingWebhookEvents).values([
    { requestId: "first", resourceId: "100", topic: "payment" },
    { requestId: "duplicate", resourceId: "100", topic: "payment" },
    { requestId: "second", resourceId: "101", topic: "payment" },
    { requestId: "unknown", resourceId: "999", topic: "payment" },
    { requestId: "subscription", resourceId: "sub", topic: "subscription_preapproval" },
  ]);
  expect(await processPaymentEvents(db, config)).toEqual({ processed: 3, failed: 2 });
  const [saved] = await db.select().from(billingInvoices).where(eq(billingInvoices.id, invoice.id));
  expect(saved.providerStatus).toBe("approved");
  expect(saved.paymentId).toBe("100");
  expect(await db.select().from(billingPaymentAttempts)).toHaveLength(2);
  expect(await processPaymentEvents(db, config)).toEqual({ processed: 0, failed: 0 });
});

// A Mercado Pago pode avisar da cobrança antes de anexar o pagamento a ela: a fatura nasce sem ligação
// e o pagamento chega com a assinatura como referência.
function adoptSetup() {
  return (async () => {
    const db = await createTestDb();
    const tenant = await seedTenant(db);
    const [subscription] = await db.insert(billingSubscriptions).values({ tenantId: tenant.id, planId: tenant.planId }).returning();
    const due = new Date("2030-01-02T00:00:00Z");
    const [invoice] = await db.insert(billingInvoices).values({ tenantId: tenant.id, subscriptionId: subscription.id, providerId: "invoice-adopt", providerStatus: "pending", amountCents: 3990, dueAt: due }).returning();
    const payment = (overrides: Record<string, unknown> = {}) => ({ id: 777, external_reference: subscription.id, collector_id: 42, live_mode: false, currency_id: "BRL", transaction_amount: 39.9, status: "rejected", date_created: "2030-01-02T00:00:30Z", date_last_updated: "2030-01-02T00:00:31Z", ...overrides });
    const config = (body: object) => ({ accessToken: "test", collectorId: "42", liveMode: false, fetcher: async () => new Response(JSON.stringify(body)) });
    return { db, tenant, subscription, invoice, due, payment, config };
  })();
}

it("pagamento sem fatura ligada: liga à única fatura da assinatura com o mesmo valor e horário", async () => {
  const { db, invoice, payment, config } = await adoptSetup();
  expect(await reconcilePayment(db, "777", config(payment()))).toBe("updated");
  const [stored] = await db.select().from(billingInvoices).where(eq(billingInvoices.id, invoice.id));
  expect(stored).toMatchObject({ providerStatus: "rejected", paymentId: "777" });
  const links = await db.select().from(billingInvoicePaymentLinks);
  expect(links).toEqual([expect.objectContaining({ paymentId: "777", invoiceId: invoice.id })]);
  // Repetir o aviso não muda nada e não duplica.
  expect(await reconcilePayment(db, "777", config(payment()))).toBe("unchanged");
  expect(await db.select().from(billingInvoicePaymentLinks)).toHaveLength(1);
});

it("não adivinha: duas faturas candidatas, fora da janela de 15 minutos ou valor diferente", async () => {
  const { db, tenant, subscription, payment, config } = await adoptSetup();
  // Valor diferente.
  await expect(reconcilePayment(db, "777", config(payment({ transaction_amount: 49.9 })))).rejects.toThrow("não corresponde");
  // Pagamento criado muito depois do vencimento da fatura.
  await expect(reconcilePayment(db, "777", config(payment({ date_created: "2030-01-02T01:00:00Z" })))).rejects.toThrow("não corresponde");
  // Sem data de criação do pagamento.
  await expect(reconcilePayment(db, "777", config(payment({ date_created: undefined })))).rejects.toThrow("não corresponde");
  // Duas faturas candidatas ao mesmo tempo.
  await db.insert(billingInvoices).values({ tenantId: tenant.id, subscriptionId: subscription.id, providerId: "invoice-adopt-2", providerStatus: "pending", amountCents: 3990, dueAt: new Date("2030-01-02T00:05:00Z") });
  await expect(reconcilePayment(db, "777", config(payment()))).rejects.toThrow("não corresponde");
  expect(await db.select().from(billingInvoicePaymentLinks)).toHaveLength(0);
  expect(await db.select().from(billingPaymentAttempts)).toHaveLength(0);
});

it("não usa fatura que já tem pagamento ligado nem de outra assinatura", async () => {
  const { db, tenant, invoice, payment, config } = await adoptSetup();
  await db.insert(billingInvoicePaymentLinks).values({ paymentId: "outro", tenantId: tenant.id, invoiceId: invoice.id });
  await expect(reconcilePayment(db, "777", config(payment()))).rejects.toThrow("não corresponde");
  const [otherSubscription] = await db.insert(billingSubscriptions).values({ tenantId: tenant.id, planId: tenant.planId }).returning();
  await expect(reconcilePayment(db, "777", config(payment({ external_reference: otherSubscription.id })))).rejects.toThrow("não corresponde");
});
