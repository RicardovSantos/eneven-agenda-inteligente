import { eq } from "drizzle-orm";
import { afterEach, expect, it, vi } from "vitest";
import { auditLog, billingNotices, tenants, users } from "@/db/schema";
import { processTestBillingNotices } from "@/server/billing/test-notices";
import { reviewTestNotice } from "@/server/billing/review-test-notice";
import { POST } from "@/app/api/cron/avisos-cobranca/route";
import { seedTenant } from "../helpers/agenda-fixtures";
import { createTestDb } from "../helpers/test-db";

afterEach(() => vi.unstubAllEnvs());

it("reserva um aviso por atraso e nunca repete uma falha incerta", async () => {
  const db = await createTestDb();
  const tenant = await seedTenant(db);
  const other = await seedTenant(db);
  const now = new Date("2030-02-10T00:00:00Z");
  const pastDueAt = new Date("2030-02-01T00:00:00Z");
  for (const item of [tenant, other]) await db.update(tenants).set({ status: "past_due", pastDueAt }).where(eq(tenants.id, item.id));
  const sender = vi.fn().mockResolvedValueOnce(undefined).mockRejectedValueOnce(new Error("timeout"));
  expect(await processTestBillingNotices(db, "teste@example.com", sender, now)).toEqual({ sent: 1, uncertain: 1 });
  expect((await db.select().from(billingNotices)).map((notice) => notice.state).sort()).toEqual(["sent", "uncertain"]);
  expect(await processTestBillingNotices(db, "teste@example.com", sender, now)).toEqual({ sent: 0, uncertain: 0 });
  expect(sender).toHaveBeenCalledTimes(2);
  expect(sender).toHaveBeenCalledWith("teste@example.com");
  const [operator] = await db.insert(users).values({ name: "Operador", email: "admin@example.com", isSuperAdmin: true }).returning();
  const notice = (await db.select().from(billingNotices)).find((item) => item.state === "uncertain")!;
  await reviewTestNotice(db, notice.id, operator.id, "confirmed", now);
  await expect(reviewTestNotice(db, notice.id, operator.id, "retry", now)).rejects.toThrow("indisponível");
  expect(await db.select().from(auditLog)).toMatchObject([{ action: "billing.test_notice_reviewed", actorUserId: operator.id }]);
});

it("bloqueia o processador e a rota em produção", async () => {
  const db = await createTestDb();
  vi.stubEnv("NODE_ENV", "production");
  await expect(processTestBillingNotices(db, "teste@example.com", async () => {})).rejects.toThrow("produção");
  expect((await POST(new Request("http://localhost", { method: "POST" }))).status).toBe(503);
});
