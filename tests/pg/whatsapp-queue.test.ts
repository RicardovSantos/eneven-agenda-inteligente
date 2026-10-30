import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { whatsappQueue } from "@/db/schema";
import { withTenant } from "@/server/tenant-db";
import { processQueue } from "@/server/whatsapp/queue";
import { FakeWhatsAppChannel } from "@/server/whatsapp/fake-client";
import { setWhatsAppChannelForTests } from "@/server/whatsapp/channel";
import { seedBooking, seedTenant } from "../helpers/agenda-fixtures";
import { connectPg } from "./pg-db";

const pg = connectPg();
beforeEach(() => pg.truncate());
afterAll(async () => { setWhatsAppChannelForTests(null); await pg.close(); });

describe("fila WhatsApp no PostgreSQL", () => {
  it("não envia duas vezes com workers concorrentes", async () => {
    const tenant = await seedTenant(pg.db);
    const now = new Date();
    const start = new Date(now.getTime() + 86_400_000);
    const booking = await seedBooking(pg.db, tenant.id, { startsAt: start, endsAt: new Date(start.getTime() + 1_800_000), blockedUntil: new Date(start.getTime() + 1_800_000) });
    await withTenant(pg.db, tenant.id, (tx) => tx.insert(whatsappQueue).values({ tenantId: tenant.id, bookingId: booking.id, templateType: "booking_created", eventKey: "created", scheduledFor: now }));
    const fake = new FakeWhatsAppChannel();
    setWhatsAppChannelForTests(fake);
    const results = await Promise.all(Array.from({ length: 3 }, () => processQueue(pg.db, 1, now)));
    expect(results.reduce((sum, result) => sum + result.sent, 0)).toBe(1);
    expect(fake.sentMessages).toHaveLength(1);
  });
});
