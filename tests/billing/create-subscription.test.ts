import { eq } from "drizzle-orm";
import { expect, it, vi } from "vitest";
import { billingSubscriptions, memberships, users } from "@/db/schema";
import { createSubscription } from "@/server/billing/create-subscription";
import { seedTenant } from "../helpers/agenda-fixtures";
import { createTestDb } from "../helpers/test-db";

it("reserva assinatura antes da chamada e bloqueia tentativas duplicadas", async () => {
  const db = await createTestDb();
  const tenant = await seedTenant(db);
  const fetcher = vi.fn<typeof fetch>().mockImplementation(async (_url, init) => {
    const body = JSON.parse(String(init?.body));
    expect(body.auto_recurring).toMatchObject({ frequency: 1, frequency_type: "months", transaction_amount: 39.9, currency_id: "BRL" });
    return Response.json({ id: "sub-1", external_reference: body.external_reference, collector_id: 42, status: "pending", init_point: "https://www.mercadopago.com.br/subscriptions/checkout?id=sub-1", auto_recurring: body.auto_recurring });
  });
  const input = { tenantId: tenant.id, planId: tenant.planId, payerEmail: "owner@example.com", backUrl: "https://agenda.eneven.com.br/painel" };
  const config = { accessToken: "TEST-example", collectorId: "42", fetcher };
  expect((await createSubscription(db, input, config)).checkoutUrl).toContain("mercadopago.com.br");
  await expect(createSubscription(db, input, config)).rejects.toThrow(/já existe/i);
  expect(fetcher).toHaveBeenCalledTimes(1);
});

it("mantém resultado incerto bloqueado quando a comunicação falha", async () => {
  const db = await createTestDb();
  const tenant = await seedTenant(db);
  const fetcher = vi.fn<typeof fetch>().mockRejectedValue(new Error("timeout"));
  const input = { tenantId: tenant.id, planId: tenant.planId, payerEmail: "owner@example.com", backUrl: "https://agenda.eneven.com.br/painel" };
  const config = { accessToken: "TEST-example", collectorId: "42", fetcher };
  await expect(createSubscription(db, input, config)).rejects.toThrow("revise a ocorrência");
  const [saved] = await db.select().from(billingSubscriptions).where(eq(billingSubscriptions.tenantId, tenant.id));
  expect(saved.providerStatus).toBe("uncertain");
  await expect(createSubscription(db, input, config)).rejects.toThrow(/já existe/i);
  expect(fetcher).toHaveBeenCalledTimes(1);
});

it("não retorna link quando o provedor informa valor divergente ou endereço inseguro", async () => {
  const db = await createTestDb();
  for (const invalid of ["amount", "url"] as const) {
    const tenant = await seedTenant(db);
    const fetcher: typeof fetch = async (_url, init) => {
      const body = JSON.parse(String(init?.body));
      return Response.json({ id: `sub-${invalid}`, external_reference: body.external_reference, collector_id: 42, status: "pending", init_point: invalid === "url" ? "https://evil.example/" : "https://www.mercadopago.com.br/checkout", auto_recurring: { ...body.auto_recurring, transaction_amount: invalid === "amount" ? 1 : 39.9 } });
    };
    await expect(createSubscription(db, { tenantId: tenant.id, planId: tenant.planId, payerEmail: "owner@example.com", backUrl: "https://agenda.eneven.com.br/painel" }, { accessToken: "TEST-example", collectorId: "42", fetcher })).rejects.toThrow("revise a ocorrência");
    const [saved] = await db.select().from(billingSubscriptions).where(eq(billingSubscriptions.tenantId, tenant.id));
    expect(saved.providerStatus).toBe("uncertain");
  }
});

it("verifica o vínculo do dono dentro da reserva antes de chamar o provedor", async () => {
  const db = await createTestDb();
  const tenant = await seedTenant(db);
  const [user] = await db.insert(users).values({ name: "Dona", email: "dona@example.com" }).returning();
  const fetcher = vi.fn<typeof fetch>();
  const input = { tenantId: tenant.id, planId: tenant.planId, payerEmail: user.email, backUrl: "https://agenda.eneven.com.br/painel", ownerUserId: user.id };
  const config = { accessToken: "TEST-example", collectorId: "42", fetcher };
  await expect(createSubscription(db, input, config)).rejects.toThrow("Acesso indisponível");
  await db.insert(memberships).values({ tenantId: tenant.id, userId: user.id, role: "staff" });
  await expect(createSubscription(db, input, config)).rejects.toThrow("Acesso indisponível");
  expect(fetcher).not.toHaveBeenCalled();
  expect(await db.select().from(billingSubscriptions)).toHaveLength(0);
});
