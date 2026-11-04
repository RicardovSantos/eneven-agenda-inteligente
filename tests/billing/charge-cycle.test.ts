import { eq } from "drizzle-orm";
import { expect, it, vi } from "vitest";
import { billingCharges, billingSubscriptions, tenants } from "@/db/schema";
import { expirePaidAccess, expireStaleCharges, processChargeOverdueNotices, processRenewalNotices, runChargeCycle } from "@/server/billing/charge-cycle";
import { seedTenant } from "../helpers/agenda-fixtures";
import { createTestDb } from "../helpers/test-db";

const NOW = new Date("2030-02-10T12:00:00Z");
const days = (n: number) => new Date(NOW.getTime() + n * 86_400_000);

async function paidTenant(db: Awaited<ReturnType<typeof createTestDb>>, paidUntil: Date, status: "active" | "read_only" = "active") {
  const tenant = await seedTenant(db);
  await db.update(tenants).set({ status, paidUntil }).where(eq(tenants.id, tenant.id));
  return tenant;
}

it("passa a atrasado só quem pagou por Pix ou boleto e venceu, com a carência de sempre", async () => {
  const db = await createTestDb();
  const expired = await paidTenant(db, days(-1));
  const valid = await paidTenant(db, days(5));
  const blocked = await paidTenant(db, days(-1), "read_only");
  const card = await paidTenant(db, days(-1));
  await db.insert(billingSubscriptions).values({ tenantId: card.id, planId: card.planId, providerStatus: "authorized", providerId: "sub-card" });

  expect(await expirePaidAccess(db, NOW)).toEqual({ expired: 1 });
  const status = async (id: string) => (await db.select().from(tenants).where(eq(tenants.id, id)))[0];
  expect(await status(expired.id)).toMatchObject({ status: "past_due", pastDueAt: days(-1) });
  expect((await status(valid.id)).status).toBe("active");
  expect((await status(blocked.id)).status).toBe("read_only");
  expect((await status(card.id)).status).toBe("active");
  expect(await expirePaidAccess(db, NOW)).toEqual({ expired: 0 });
});

it("avisa o vencimento uma única vez e só quem está na janela, sem cobrança em aberto e sem cartão", async () => {
  const db = await createTestDb();
  const soon = await paidTenant(db, days(8));
  await paidTenant(db, days(30));
  const withOpen = await paidTenant(db, days(3));
  await db.insert(billingCharges).values({ tenantId: withOpen.id, planId: withOpen.planId, method: "pix", amountCents: 3990, status: "pending" });
  const send = vi.fn().mockResolvedValue(undefined);

  expect(await processRenewalNotices(db, send, { now: NOW })).toEqual({ sent: 1, uncertain: 0 });
  expect(send).toHaveBeenCalledWith(soon.id, days(8));
  expect(await processRenewalNotices(db, send, { now: NOW })).toEqual({ sent: 0, uncertain: 0 });
  expect(send).toHaveBeenCalledTimes(1);

  const failing = await paidTenant(db, days(2));
  const broken = vi.fn().mockRejectedValue(new Error("e-mail fora do ar"));
  expect(await processRenewalNotices(db, broken, { now: NOW })).toEqual({ sent: 0, uncertain: 1 });
  expect(await processRenewalNotices(db, broken, { now: NOW })).toEqual({ sent: 0, uncertain: 0 });
  expect(broken).toHaveBeenCalledWith(failing.id, days(2));
});

it("avisa o atraso por Pix ou boleto uma vez, sem tocar em quem tem cartão", async () => {
  const db = await createTestDb();
  const late = await paidTenant(db, days(-1));
  const card = await paidTenant(db, days(-1));
  await db.insert(billingSubscriptions).values({ tenantId: card.id, planId: card.planId, providerStatus: "authorized", providerId: "sub-card-2" });
  await expirePaidAccess(db, NOW);
  const send = vi.fn().mockResolvedValue(undefined);
  expect(await processChargeOverdueNotices(db, send, { now: NOW })).toEqual({ sent: 1, uncertain: 0 });
  expect(send).toHaveBeenCalledWith(late.id);
  expect(await processChargeOverdueNotices(db, send, { now: NOW })).toEqual({ sent: 0, uncertain: 0 });
});

it("cobrança em aberto que passou da validade libera uma nova", async () => {
  const db = await createTestDb();
  const tenant = await seedTenant(db);
  await db.insert(billingCharges).values([
    { tenantId: tenant.id, planId: tenant.planId, method: "boleto", amountCents: 3990, status: "pending", expiresAt: days(-3) },
  ]);
  expect(await expireStaleCharges(db, NOW)).toEqual({ expired: 1 });
  expect((await db.select().from(billingCharges))[0].status).toBe("expired");
});

it("o ciclo junta vencimento, avisos e validade", async () => {
  const db = await createTestDb();
  await paidTenant(db, days(-1));
  await paidTenant(db, days(4));
  const renewal = vi.fn().mockResolvedValue(undefined);
  const overdue = vi.fn().mockResolvedValue(undefined);
  const result = await runChargeCycle(db, { renewal, overdue }, NOW);
  expect(result).toMatchObject({ access: { expired: 1 }, renewal: { sent: 1 }, overdue: { sent: 1 } });
});
