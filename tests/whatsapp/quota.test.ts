import { describe, expect, it } from "vitest";
import { whatsappMessages } from "@/db/schema";
import { withTenant } from "@/server/tenant-db";
import { checkMetaDailyLimit, checkTenantQuota } from "@/server/whatsapp/quota";
import { seedTenant } from "../helpers/agenda-fixtures";
import { createTestDb } from "../helpers/test-db";

describe("consultas de franquia", () => {
  it("isola estabelecimentos e conta destinatários únicos", async () => {
    const db = await createTestDb();
    const a = await seedTenant(db);
    const b = await seedTenant(db);
    const now = new Date("2030-10-15T12:00:00Z");
    await withTenant(db, a.id, (tx) => tx.insert(whatsappMessages).values([
      { tenantId: a.id, recipientPhone: "5511999999999", status: "sent", createdAt: new Date("2030-10-15T10:00:00Z") },
      { tenantId: a.id, recipientPhone: "5511999999999", status: "read", createdAt: new Date("2030-10-15T11:00:00Z") },
      { tenantId: a.id, recipientPhone: "5511988888888", status: "failed", createdAt: new Date("2030-10-15T11:00:00Z") },
    ]));
    expect(await checkTenantQuota(db, a.id, now)).toEqual({ used: 2, total: 50, allowed: true });
    expect(await checkTenantQuota(db, b.id, now)).toEqual({ used: 0, total: 50, allowed: true });
    expect(await checkMetaDailyLimit(db, now)).toEqual({ count: 1, allowed: true, warnSuperAdmin: false });
  });
});
