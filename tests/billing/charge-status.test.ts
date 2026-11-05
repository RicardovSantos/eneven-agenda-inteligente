import { eq } from "drizzle-orm";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { billingCharges, memberships, tenants, users } from "@/db/schema";
import type { Db } from "@/db/types";
import { getChargeStatus, CHECK_INTERVAL_MS } from "@/server/billing/charge-status";
import { createCharge } from "@/server/billing/charges";
import { seedTenant } from "../helpers/agenda-fixtures";
import { createTestDb } from "../helpers/test-db";

let db: Db;
let tenant: Awaited<ReturnType<typeof seedTenant>>;
let chargeId: string;
let reference: string;

const pixResponse = (body: Record<string, unknown>) => ({
  id: 5550001, status: "pending", external_reference: body.external_reference, collector_id: 42, live_mode: false, currency_id: "BRL",
  transaction_amount: body.transaction_amount, date_last_updated: "2030-01-01T00:00:00Z",
  point_of_interaction: { transaction_data: { qr_code: "00020126PIXCOPIAECOLA", qr_code_base64: "iVBORw0KGgo=" } },
});

beforeEach(async () => {
  db = await createTestDb();
  tenant = await seedTenant(db);
  const [owner] = await db.insert(users).values({ name: "Dona", email: `d${Math.random()}@example.com`, emailVerifiedAt: new Date() }).returning();
  await db.insert(memberships).values({ tenantId: tenant.id, userId: owner.id, role: "owner" });
  const create = vi.fn<typeof fetch>().mockImplementation(async (_url, init) => Response.json(pixResponse(JSON.parse(String(init?.body)))));
  ({ id: chargeId } = await createCharge(db, { tenantId: tenant.id, ownerUserId: owner.id, method: "pix" }, { accessToken: "TEST-example", collectorId: "42", fetcher: create }));
  reference = `charge:${chargeId}`;
});

const pending = () => ({ ...pixResponse({ external_reference: reference, transaction_amount: 39.9 }) });
const approved = () => ({ ...pending(), status: "approved", date_approved: "2030-01-02T00:00:00Z", date_last_updated: "2030-01-02T00:00:00Z" });
const config = (payment: object) => ({ accessToken: "TEST-example", collectorId: "42", liveMode: false, fetcher: (async () => Response.json(payment)) as typeof fetch });
let clock = new Date("2031-01-01T00:00:00Z").getTime();
/** Cada chamada anda o relógio além do intervalo mínimo, para não esbarrar na trava entre consultas. */
const tick = () => new Date((clock += CHECK_INTERVAL_MS + 100));

describe("situação do Pix para a tela do QR Code", () => {
  it("ainda não pago: continua pendente e não libera o plano", async () => {
    expect(await getChargeStatus(db, tenant.id, chargeId, { config: config(pending()), now: tick() })).toEqual({ state: "pending", method: "pix" });
    expect((await db.select().from(tenants).where(eq(tenants.id, tenant.id)))[0].paidUntil).toBeNull();
  });

  it("pago: confere na Mercado Pago, libera o mês e devolve a data, sem esperar o aviso", async () => {
    const result = await getChargeStatus(db, tenant.id, chargeId, { config: config(approved()), now: tick() });
    expect(result).toMatchObject({ state: "approved", method: "pix" });
    expect((result as { paidUntil: string }).paidUntil).toMatch(/^\d{4}-\d{2}-\d{2}T/);
    expect((result as { paidUntilLabel: string }).paidUntilLabel).toMatch(/^\d{2}\/\d{2}\/\d{4}$/);
    const [saved] = await db.select().from(tenants).where(eq(tenants.id, tenant.id));
    expect(saved.status).toBe("active");
    expect(saved.paidUntil).not.toBeNull();
    // Perguntar de novo não soma outro mês nem muda a resposta.
    const again = await getChargeStatus(db, tenant.id, chargeId, { config: config(approved()), now: tick() });
    expect(again).toMatchObject({ state: "approved" });
    expect((await db.select().from(tenants).where(eq(tenants.id, tenant.id)))[0].paidUntil).toEqual(saved.paidUntil);
  });

  it("não consulta a Mercado Pago a cada pergunta: respeita o intervalo mínimo", async () => {
    const fetcher = vi.fn(async () => Response.json(pending()));
    const cfg = { accessToken: "TEST-example", collectorId: "42", liveMode: false, fetcher: fetcher as unknown as typeof fetch };
    const start = tick();
    await getChargeStatus(db, tenant.id, chargeId, { config: cfg, now: start });
    await getChargeStatus(db, tenant.id, chargeId, { config: cfg, now: new Date(start.getTime() + 500) });
    await getChargeStatus(db, tenant.id, chargeId, { config: cfg, now: new Date(start.getTime() + 1_000) });
    expect(fetcher).toHaveBeenCalledTimes(1);
    await getChargeStatus(db, tenant.id, chargeId, { config: cfg, now: new Date(start.getTime() + CHECK_INTERVAL_MS + 50) });
    expect(fetcher).toHaveBeenCalledTimes(2);
  });

  it("sem configuração (fora de produção): só lê o que o banco já sabe", async () => {
    expect(await getChargeStatus(db, tenant.id, chargeId, { now: tick() })).toEqual({ state: "pending", method: "pix" });
    await db.update(billingCharges).set({ status: "approved", paidAt: new Date(), periodEnd: new Date("2031-02-01T00:00:00Z") }).where(eq(billingCharges.id, chargeId));
    expect(await getChargeStatus(db, tenant.id, chargeId, { now: tick() })).toMatchObject({ state: "approved" });
  });

  it("Mercado Pago fora do ar: segue pendente, sem erro", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    const down = { accessToken: "TEST-example", collectorId: "42", liveMode: false, fetcher: (async () => new Response("erro", { status: 500 })) as typeof fetch };
    expect(await getChargeStatus(db, tenant.id, chargeId, { config: down, now: tick() })).toEqual({ state: "pending", method: "pix" });
    warn.mockRestore();
  });

  it("vencido e recusado têm resposta própria", async () => {
    await db.update(billingCharges).set({ status: "expired" }).where(eq(billingCharges.id, chargeId));
    expect(await getChargeStatus(db, tenant.id, chargeId, { now: tick() })).toEqual({ state: "expired", method: "pix" });
    await db.update(billingCharges).set({ status: "cancelled" }).where(eq(billingCharges.id, chargeId));
    expect(await getChargeStatus(db, tenant.id, chargeId, { now: tick() })).toEqual({ state: "failed", method: "pix" });
  });

  it("cobrança de outro estabelecimento ou id inválido: responde como se não existisse", async () => {
    const other = await seedTenant(db);
    expect(await getChargeStatus(db, other.id, chargeId, { config: config(approved()), now: tick() })).toEqual({ state: "none" });
    expect(await getChargeStatus(db, tenant.id, "isso-nao-e-um-id", { now: tick() })).toEqual({ state: "none" });
    expect(await getChargeStatus(db, tenant.id, "00000000-0000-4000-8000-000000000000", { now: tick() })).toEqual({ state: "none" });
    // E nada disso liberou o plano de ninguém.
    expect((await db.select().from(tenants).where(eq(tenants.id, other.id)))[0].paidUntil).toBeNull();
  });
});
