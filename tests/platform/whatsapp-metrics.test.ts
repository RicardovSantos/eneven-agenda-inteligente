import { describe, expect, it } from "vitest";
import { whatsappMessages } from "@/db/schema";
import { withTenant } from "@/server/tenant-db";
import { getWhatsAppMetrics } from "@/server/platform/whatsapp-metrics";
import { seedTenant } from "../helpers/agenda-fixtures";
import { createTestDb } from "../helpers/test-db";

describe("métricas WhatsApp da plataforma", () => {
  it("conta mensagens enviadas e estima o custo em centavos", async () => {
    const db = await createTestDb();
    const tenant = await seedTenant(db);
    const now = new Date("2030-10-15T12:00:00Z");
    await withTenant(db, tenant.id, (tx) => tx.insert(whatsappMessages).values([
      { tenantId: tenant.id, recipientPhone: "5511999999999", status: "sent", createdAt: new Date("2030-10-15T10:00:00Z") },
      { tenantId: tenant.id, recipientPhone: "5511999999999", status: "read", createdAt: new Date("2030-10-15T11:00:00Z") },
      { tenantId: tenant.id, recipientPhone: "5511988888888", status: "failed", createdAt: new Date("2030-10-15T11:00:00Z") },
    ]));
    expect(await getWhatsAppMetrics(db, now)).toMatchObject({ monthlySent: 2, estimatedCents: 7, daily: { count: 1 } });
  });
});
