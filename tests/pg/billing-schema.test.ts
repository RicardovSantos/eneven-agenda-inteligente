import { afterAll, beforeEach, expect, it } from "vitest";
import { billingInvoices, billingSubscriptions } from "@/db/schema";
import { withTenant } from "@/server/tenant-db";
import { seedTenant } from "../helpers/agenda-fixtures";
import { connectPg } from "./pg-db";

const pg = connectPg();
beforeEach(() => pg.truncate());
afterAll(() => pg.close());

it("protege faturas por estabelecimento e impede vínculo cruzado", async () => {
  const a = await seedTenant(pg.db);
  const b = await seedTenant(pg.db);
  const [sub] = await pg.db.insert(billingSubscriptions).values({ tenantId: a.id, planId: a.planId }).returning();
  await pg.db.insert(billingInvoices).values({ tenantId: a.id, subscriptionId: sub.id, providerId: sub.id, providerStatus: "pending", amountCents: 3990 });
  expect(await withTenant(pg.db, a.id, (tx) => tx.select().from(billingInvoices))).toHaveLength(1);
  expect(await withTenant(pg.db, b.id, (tx) => tx.select().from(billingInvoices))).toHaveLength(0);
  await expect(pg.db.insert(billingInvoices).values({ tenantId: b.id, subscriptionId: sub.id, providerId: b.id, providerStatus: "pending", amountCents: 3990 })).rejects.toThrow();
  await expect(withTenant(pg.db, a.id, (tx) => tx.insert(billingSubscriptions).values({ tenantId: a.id, planId: a.planId }))).rejects.toThrow();
});
