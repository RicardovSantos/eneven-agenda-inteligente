import { eq } from "drizzle-orm";
import { expect, it, vi } from "vitest";
import { billingCharges, billingSubscriptions, billingWebhookEvents, memberships, tenants, users } from "@/db/schema";
import { ChargeError, createCharge, reconcileCharge } from "@/server/billing/charges";
import { parseBoletoPayer } from "@/server/billing/charge-payer";
import { processPaymentEvents } from "@/server/billing/process-events";
import { seedTenant } from "../helpers/agenda-fixtures";
import { createTestDb } from "../helpers/test-db";

async function setup() {
  const db = await createTestDb();
  const tenant = await seedTenant(db);
  const [owner] = await db.insert(users).values({ name: "Dona", email: `d${Math.random()}@example.com`, emailVerifiedAt: new Date() }).returning();
  await db.insert(memberships).values({ tenantId: tenant.id, userId: owner.id, role: "owner" });
  return { db, tenant, owner };
}

const boletoPayer = { name: "Maria da Silva", document: "529.982.247-25", zipCode: "01310-100", street: "Avenida Paulista", number: "1000", neighborhood: "Bela Vista", city: "São Paulo", state: "sp" };

function providerPayment(body: Record<string, unknown>, over: Record<string, unknown> = {}) {
  const pix = body.payment_method_id === "pix";
  return {
    id: 5550001, status: "pending", external_reference: body.external_reference, collector_id: 42, live_mode: false, currency_id: "BRL",
    transaction_amount: body.transaction_amount, date_last_updated: "2030-01-01T00:00:00Z",
    ...(pix
      ? { point_of_interaction: { transaction_data: { qr_code: "00020126PIXCOPIAECOLA", qr_code_base64: "iVBORw0KGgo=" } } }
      : { transaction_details: { external_resource_url: "https://www.mercadopago.com.br/payments/5550001/ticket?caller_id=1" }, barcode: { content: "23793381286000000000300000000001" } }),
    ...over,
  };
}

const config = (fetcher: typeof fetch) => ({ accessToken: "TEST-example", collectorId: "42", fetcher });

it("cria o Pix com o valor do plano, referência própria e chave de idempotência", async () => {
  const { db, tenant, owner } = await setup();
  const fetcher = vi.fn<typeof fetch>().mockImplementation(async (_url, init) => {
    const body = JSON.parse(String(init?.body));
    expect(body).toMatchObject({ transaction_amount: 39.9, payment_method_id: "pix" });
    expect(body.external_reference).toMatch(/^charge:[0-9a-f-]{36}$/);
    expect(new Headers(init?.headers).get("X-Idempotency-Key")).toBe(body.external_reference.slice(7));
    expect(body.payer).toEqual({ email: expect.stringContaining("@example.com") });
    return Response.json(providerPayment(body));
  });
  const { id } = await createCharge(db, { tenantId: tenant.id, ownerUserId: owner.id, method: "pix" }, config(fetcher));
  const [saved] = await db.select().from(billingCharges).where(eq(billingCharges.id, id));
  expect(saved).toMatchObject({ status: "pending", method: "pix", amountCents: 3990, providerPaymentId: "5550001", qrCode: "00020126PIXCOPIAECOLA" });
  // Só uma cobrança em aberto por vez.
  await expect(createCharge(db, { tenantId: tenant.id, ownerUserId: owner.id, method: "pix" }, config(fetcher))).rejects.toThrow(/em aberto/);
  expect(fetcher).toHaveBeenCalledTimes(1);
});

it("cria o boleto com os dados do pagador e guarda só o link e a linha digitável", async () => {
  const { db, tenant, owner } = await setup();
  const fetcher = vi.fn<typeof fetch>().mockImplementation(async (_url, init) => {
    const body = JSON.parse(String(init?.body));
    expect(body.payment_method_id).toBe("bolbradesco");
    expect(body.payer).toMatchObject({
      first_name: "Maria", last_name: "da Silva",
      identification: { type: "CPF", number: "52998224725" },
      address: { zip_code: "01310100", street_name: "Avenida Paulista", street_number: "1000", neighborhood: "Bela Vista", city: "São Paulo", federal_unit: "SP" },
    });
    return Response.json(providerPayment(body));
  });
  const { id } = await createCharge(db, { tenantId: tenant.id, ownerUserId: owner.id, method: "boleto", payer: boletoPayer }, config(fetcher));
  const [saved] = await db.select().from(billingCharges).where(eq(billingCharges.id, id));
  expect(saved.ticketUrl).toContain("mercadopago.com.br");
  expect(saved.barcode).toBe("23793381286000000000300000000001");
  expect(JSON.stringify(saved)).not.toContain("52998224725");
});

it("recusa boleto com dados inválidos sem chamar o provedor nem reservar cobrança", async () => {
  const { db, tenant, owner } = await setup();
  const fetcher = vi.fn<typeof fetch>();
  const error = await createCharge(db, { tenantId: tenant.id, ownerUserId: owner.id, method: "boleto", payer: { ...boletoPayer, document: "111.111.111-11", zipCode: "123" } }, config(fetcher)).catch((e: unknown) => e);
  expect(error).toBeInstanceOf(ChargeError);
  expect((error as ChargeError).fieldErrors).toMatchObject({ document: expect.any(String), zipCode: expect.any(String) });
  expect(fetcher).not.toHaveBeenCalled();
  expect(await db.select().from(billingCharges)).toHaveLength(0);
});

it("recusa quem não é o dono, quem já tem cartão e resposta com valor diferente", async () => {
  const { db, tenant, owner } = await setup();
  const [stranger] = await db.insert(users).values({ name: "Outro", email: "outro@example.com", emailVerifiedAt: new Date() }).returning();
  const fetcher = vi.fn<typeof fetch>().mockImplementation(async (_url, init) => {
    const body = JSON.parse(String(init?.body));
    return Response.json(providerPayment(body, { transaction_amount: 1 }));
  });
  await expect(createCharge(db, { tenantId: tenant.id, ownerUserId: stranger.id, method: "pix" }, config(fetcher))).rejects.toThrow("Acesso indisponível");
  // Valor divergente do provedor: cobrança fica "uncertain" e bloqueia nova tentativa.
  await expect(createCharge(db, { tenantId: tenant.id, ownerUserId: owner.id, method: "pix" }, config(fetcher))).rejects.toThrow(/Não foi possível confirmar/);
  expect((await db.select().from(billingCharges))[0].status).toBe("uncertain");
  await db.delete(billingCharges);
  await db.insert(billingSubscriptions).values({ tenantId: tenant.id, planId: tenant.planId, providerStatus: "authorized", providerId: "sub-1" });
  await expect(createCharge(db, { tenantId: tenant.id, ownerUserId: owner.id, method: "pix" }, config(fetcher))).rejects.toThrow(/cartão/);
});

it("pagamento aprovado soma um mês uma única vez, mesmo com avisos repetidos", async () => {
  const { db, tenant, owner } = await setup();
  const create = vi.fn<typeof fetch>().mockImplementation(async (_url, init) => Response.json(providerPayment(JSON.parse(String(init?.body)))));
  const { id } = await createCharge(db, { tenantId: tenant.id, ownerUserId: owner.id, method: "pix" }, config(create));
  const [charge] = await db.select().from(billingCharges).where(eq(billingCharges.id, id));
  const approved = { ...providerPayment({ external_reference: `charge:${id}`, transaction_amount: 39.9, payment_method_id: "pix" }), status: "approved", date_approved: "2030-01-02T00:00:00Z", date_last_updated: "2030-01-02T00:00:00Z" };
  const fetcher: typeof fetch = async () => Response.json(approved);
  const reconcileConfig = { accessToken: "TEST-example", collectorId: "42", liveMode: false, fetcher };
  const now = new Date("2030-01-02T12:00:00Z");
  expect(await reconcileCharge(db, charge.providerPaymentId!, reconcileConfig, now)).toBe("updated");
  expect(await reconcileCharge(db, charge.providerPaymentId!, reconcileConfig, now)).toBe("unchanged");
  const [paid] = await db.select().from(billingCharges).where(eq(billingCharges.id, id));
  expect(paid.status).toBe("approved");
  const [after] = await db.select().from(tenants).where(eq(tenants.id, tenant.id));
  expect(after.status).toBe("active");
  // O teste grátis (1 dia no fixture) não se perde: o mês começa a partir do que for maior entre agora e o fim do teste.
  expect(after.paidUntil!.getTime()).toBe(paid.periodEnd!.getTime());
  expect(paid.periodStart!.getTime()).toBeGreaterThanOrEqual(now.getTime());
});

it("não aceita pagamento de outro valor, outro vendedor ou referência estranha", async () => {
  const { db, tenant, owner } = await setup();
  const create = vi.fn<typeof fetch>().mockImplementation(async (_url, init) => Response.json(providerPayment(JSON.parse(String(init?.body)))));
  const { id } = await createCharge(db, { tenantId: tenant.id, ownerUserId: owner.id, method: "pix" }, config(create));
  const base = { ...providerPayment({ external_reference: `charge:${id}`, transaction_amount: 39.9, payment_method_id: "pix" }), status: "approved", date_approved: "2030-01-02T00:00:00Z", date_last_updated: "2030-01-02T00:00:00Z" };
  const run = (payment: object, collectorId = "42") => reconcileCharge(db, "5550001", { accessToken: "TEST-example", collectorId, liveMode: false, fetcher: async () => Response.json(payment) });
  await expect(run({ ...base, transaction_amount: 1 })).rejects.toThrow("não corresponde");
  await expect(run(base, "999")).rejects.toThrow("não corresponde");
  await expect(run({ ...base, external_reference: "outra" })).rejects.toThrow("Referência");
  expect((await db.select().from(tenants).where(eq(tenants.id, tenant.id)))[0].paidUntil).toBeNull();
});

it("reembolso não mexe no acesso, e o processador de avisos usa o caminho das cobranças avulsas", async () => {
  const { db, tenant, owner } = await setup();
  const create = vi.fn<typeof fetch>().mockImplementation(async (_url, init) => Response.json(providerPayment(JSON.parse(String(init?.body)))));
  const { id } = await createCharge(db, { tenantId: tenant.id, ownerUserId: owner.id, method: "pix" }, config(create));
  const payment = (status: string, updated: string, extra: object = {}) => ({ ...providerPayment({ external_reference: `charge:${id}`, transaction_amount: 39.9, payment_method_id: "pix" }), status, date_last_updated: updated, ...extra });
  let current: object = payment("approved", "2030-01-02T00:00:00Z", { date_approved: "2030-01-02T00:00:00Z" });
  const processConfig = { accessToken: "TEST-example", collectorId: "42", liveMode: false, fetcher: (async () => Response.json(current)) as typeof fetch };
  await db.insert(billingWebhookEvents).values({ requestId: "r1", resourceId: "5550001", topic: "payment" });
  expect(await processPaymentEvents(db, processConfig)).toEqual({ processed: 1, failed: 0 });
  const [active] = await db.select().from(tenants).where(eq(tenants.id, tenant.id));
  expect(active.status).toBe("active");
  const until = active.paidUntil!.getTime();
  current = payment("refunded", "2030-01-03T00:00:00Z");
  await db.insert(billingWebhookEvents).values({ requestId: "r2", resourceId: "5550001", topic: "payment" });
  expect(await processPaymentEvents(db, processConfig)).toEqual({ processed: 1, failed: 0 });
  expect((await db.select().from(billingCharges).where(eq(billingCharges.id, id)))[0].status).toBe("refunded");
  expect((await db.select().from(tenants).where(eq(tenants.id, tenant.id)))[0].paidUntil!.getTime()).toBe(until);
});

it("valida CPF, CNPJ e estado do pagador do boleto", () => {
  expect(parseBoletoPayer(boletoPayer)).toMatchObject({ ok: true, payer: { documentType: "CPF", state: "SP", zipCode: "01310100" } });
  expect(parseBoletoPayer({ ...boletoPayer, document: "11.222.333/0001-81" })).toMatchObject({ ok: true, payer: { documentType: "CNPJ" } });
  expect(parseBoletoPayer({ ...boletoPayer, document: "11.222.333/0001-82" }).ok).toBe(false);
  expect(parseBoletoPayer({ ...boletoPayer, name: "Maria", state: "XX" })).toMatchObject({ ok: false, errors: { name: expect.any(String), state: expect.any(String) } });
});
