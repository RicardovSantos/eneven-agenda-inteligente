import { eq } from "drizzle-orm";
import { afterAll, beforeEach, expect, it, vi } from "vitest";
import { billingNotices, tenants } from "@/db/schema";
import { processTestBillingNotices } from "@/server/billing/test-notices";
import { withTenant } from "@/server/tenant-db";
import { seedTenant } from "../helpers/agenda-fixtures";
import { connectPg } from "./pg-db";

const pg = connectPg();
beforeEach(() => pg.truncate());
afterAll(() => pg.close());

it("reserva um aviso em envios simultâneos e protege a tabela", async () => {
  const tenant = await seedTenant(pg.db);
  const now = new Date();
  await pg.db.update(tenants).set({ status: "past_due", pastDueAt: new Date(now.getTime() - 1000) }).where(eq(tenants.id, tenant.id));
  const sender = vi.fn(async () => {});
  await Promise.all([processTestBillingNotices(pg.db, "teste@example.com", sender, now), processTestBillingNotices(pg.db, "teste@example.com", sender, now)]);
  expect(sender).toHaveBeenCalledOnce();
  expect(await pg.db.select().from(billingNotices)).toMatchObject([{ state: "sent" }]);
  await expect(withTenant(pg.db, tenant.id, (tx) => tx.select().from(billingNotices))).rejects.toThrow();
});
