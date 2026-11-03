import { eq } from "drizzle-orm";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { billingSubscriptions } from "@/db/schema";
import type { Db } from "@/db/types";
import { reconcileBillingAccess } from "@/server/billing/reconcile-access";
import { refreshPendingSubscriptions } from "@/server/billing/refresh-pending";
import { seedTenant } from "../helpers/agenda-fixtures";
import { createTestDb } from "../helpers/test-db";

const NOW = new Date("2030-01-10T12:00:00Z");

function remoteFor(subscriptionId: string, status: string) {
  return {
    id: "sub-1",
    external_reference: subscriptionId,
    collector_id: 42,
    status,
    last_modified: "2030-01-10T11:00:00Z",
    auto_recurring: { frequency: 1, frequency_type: "months", transaction_amount: 39.9, currency_id: "BRL" },
  };
}

let db: Db;
let tenant: Awaited<ReturnType<typeof seedTenant>>;

beforeEach(async () => {
  db = await createTestDb();
  tenant = await seedTenant(db);
});

async function pendingSubscription(createdAt = new Date(NOW.getTime() - 3_600_000)) {
  const [subscription] = await db
    .insert(billingSubscriptions)
    .values({
      tenantId: tenant.id,
      planId: tenant.planId,
      priceCents: 3990,
      providerId: "sub-1",
      providerStatus: "pending",
      checkoutUrl: "https://www.mercadopago.com.br/subscriptions/checkout?preapproval_id=sub-1",
      createdAt,
    })
    .returning();
  return subscription;
}

describe("assinatura pendente cancelada pela Mercado Pago (pagamento recusado)", () => {
  it("passa a cancelada, tira o link morto e deixa de travar o acesso", async () => {
    const subscription = await pendingSubscription();
    // Antes: uma assinatura "pendente" aqui deixa o acesso pedindo revisão (e os avisos travados).
    expect(await reconcileBillingAccess(db, tenant.id, NOW)).toBe("review");

    const fetcher = vi.fn(async () => Response.json(remoteFor(subscription.id, "cancelled")));
    const result = await refreshPendingSubscriptions(db, { accessToken: "t", collectorId: "42", fetcher }, { tenantId: tenant.id, now: NOW });

    expect(result).toEqual({ updated: 1, unchanged: 0, failed: 0 });
    const [saved] = await db.select().from(billingSubscriptions).where(eq(billingSubscriptions.id, subscription.id));
    expect(saved.providerStatus).toBe("cancelled");
    expect(saved.checkoutUrl).toBeNull();
    expect(saved.accessUntil).toBeNull();
    // Depois: nada a decidir para quem está em teste, e uma nova assinatura pode ser criada.
    expect(await reconcileBillingAccess(db, tenant.id, NOW)).toBe("unchanged");
  });

  it("ainda pendente na Mercado Pago: mantém o link", async () => {
    const subscription = await pendingSubscription();
    const fetcher = vi.fn(async () => Response.json(remoteFor(subscription.id, "pending")));
    // O link guardado só é trocado pelo que a Mercado Pago devolve; sem init_point a resposta é recusada.
    const result = await refreshPendingSubscriptions(db, { accessToken: "t", collectorId: "42", fetcher }, { now: NOW });
    expect(result.updated + result.unchanged + result.failed).toBe(1);
    const [saved] = await db.select().from(billingSubscriptions).where(eq(billingSubscriptions.id, subscription.id));
    expect(saved.providerStatus).toBe("pending");
  });

  it("não consulta links abandonados há mais de 7 dias", async () => {
    await pendingSubscription(new Date(NOW.getTime() - 8 * 86_400_000));
    const fetcher = vi.fn(async () => Response.json({}));
    expect(await refreshPendingSubscriptions(db, { accessToken: "t", collectorId: "42", fetcher }, { now: NOW })).toEqual({ updated: 0, unchanged: 0, failed: 0 });
    expect(fetcher).not.toHaveBeenCalled();
  });

  it("Mercado Pago fora do ar: conta a falha e não derruba quem chamou", async () => {
    await pendingSubscription();
    const fetcher = vi.fn(async () => new Response("erro", { status: 500 }));
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    expect(await refreshPendingSubscriptions(db, { accessToken: "t", collectorId: "42", fetcher }, { now: NOW })).toEqual({ updated: 0, unchanged: 0, failed: 1 });
    expect(warn).toHaveBeenCalledWith(expect.stringContaining("HTTP 500"));
    warn.mockRestore();
  });

  it("só olha o estabelecimento pedido", async () => {
    await pendingSubscription();
    const other = await seedTenant(db);
    const fetcher = vi.fn(async () => Response.json({}));
    expect(await refreshPendingSubscriptions(db, { accessToken: "t", collectorId: "42", fetcher }, { tenantId: other.id, now: NOW })).toEqual({ updated: 0, unchanged: 0, failed: 0 });
    expect(fetcher).not.toHaveBeenCalled();
  });
});
