import { afterEach, describe, expect, it } from "vitest";
import { whatsappMessages, whatsappQueue } from "@/db/schema";
import { withTenant } from "@/server/tenant-db";
import { processQueue, resolveOutboundQueue } from "@/server/whatsapp/queue";
import { FakeWhatsAppChannel } from "@/server/whatsapp/fake-client";
import { setWhatsAppChannelForTests } from "@/server/whatsapp/channel";
import { seedBooking, seedTenant } from "../helpers/agenda-fixtures";
import { createTestDb } from "../helpers/test-db";
import { seedSuperAdmin } from "../helpers/platform-fixtures";

afterEach(() => setWhatsAppChannelForTests(null));

describe("processamento de fila", () => {
  it("reserva e envia somente uma vez", async () => {
    const db = await createTestDb();
    const tenant = await seedTenant(db);
    const now = new Date();
    const start = new Date(now.getTime() + 86_400_000);
    const booking = await seedBooking(db, tenant.id, { startsAt: start, endsAt: new Date(start.getTime() + 1_800_000), blockedUntil: new Date(start.getTime() + 1_800_000) });
    await withTenant(db, tenant.id, (tx) => tx.insert(whatsappQueue).values({ tenantId: tenant.id, bookingId: booking.id, templateType: "booking_created", eventKey: "created", scheduledFor: now }));
    const fake = new FakeWhatsAppChannel();
    setWhatsAppChannelForTests(fake);
    expect(await processQueue(db, 20, now)).toEqual({ processed: 1, sent: 1, failed: 0 });
    expect(await processQueue(db, 20, now)).toEqual({ processed: 0, sent: 0, failed: 0 });
    expect(fake.sentMessages).toHaveLength(1);
    expect(await withTenant(db, tenant.id, (tx) => tx.select().from(whatsappMessages))).toHaveLength(1);
  });

  it("retém uma falha de envio para revisão e não envia novamente", async () => {
    const db = await createTestDb();
    const tenant = await seedTenant(db);
    const now = new Date();
    const start = new Date(now.getTime() + 86_400_000);
    const booking = await seedBooking(db, tenant.id, { startsAt: start, endsAt: new Date(start.getTime() + 1_800_000), blockedUntil: new Date(start.getTime() + 1_800_000) });
    await withTenant(db, tenant.id, (tx) => tx.insert(whatsappQueue).values({ tenantId: tenant.id, bookingId: booking.id, templateType: "booking_created", eventKey: "created", scheduledFor: now }));
    const fake = new FakeWhatsAppChannel();
    fake.setNextError("timeout");
    setWhatsAppChannelForTests(fake);
    expect((await processQueue(db, 1, now)).failed).toBe(1);
    expect((await processQueue(db, 1, now)).processed).toBe(0);
    const [row] = await withTenant(db, tenant.id, (tx) => tx.select().from(whatsappQueue));
    expect(row.errorMessage).toContain("incerto");
    expect(row.lockedUntil).not.toBeNull();
    const admin = await seedSuperAdmin(db);
    await resolveOutboundQueue(db, tenant.id, row.id, admin.id, "retry");
    expect((await processQueue(db, 1, now)).sent).toBe(1);
    expect(fake.sentMessages).toHaveLength(1);
  });

  it("não envia quando a franquia do estabelecimento está esgotada", async () => {
    const db = await createTestDb();
    const tenant = await seedTenant(db);
    const now = new Date();
    const start = new Date(now.getTime() + 86_400_000);
    const booking = await seedBooking(db, tenant.id, { startsAt: start, endsAt: new Date(start.getTime() + 1_800_000), blockedUntil: new Date(start.getTime() + 1_800_000) });
    await withTenant(db, tenant.id, async (tx) => {
      await tx.insert(whatsappMessages).values(Array.from({ length: 50 }, () => ({ tenantId: tenant.id, recipientPhone: "5511999990000", status: "sent" as const, createdAt: now })));
      await tx.insert(whatsappQueue).values({ tenantId: tenant.id, bookingId: booking.id, templateType: "booking_created", eventKey: "created", scheduledFor: now });
    });
    const fake = new FakeWhatsAppChannel();
    setWhatsAppChannelForTests(fake);
    expect(await processQueue(db, 1, now)).toEqual({ processed: 1, sent: 0, failed: 1 });
    const [row] = await withTenant(db, tenant.id, (tx) => tx.select().from(whatsappQueue));
    expect(row.errorMessage).toBe("quota_exceeded");
    expect(fake.sentMessages).toHaveLength(0);
  });
});
