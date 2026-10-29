import { describe, expect, it } from "vitest";
import { tenantNotificationSettings, whatsappQueue } from "@/db/schema";
import { withTenant } from "@/server/tenant-db";
import { enqueueBookingEvent } from "@/server/whatsapp/booking-events";
import { seedBooking, seedTenant } from "../helpers/agenda-fixtures";
import { createTestDb } from "../helpers/test-db";

describe("eventos de agenda", () => {
  it("não duplica o mesmo evento e permite remarcações distintas", async () => {
    const db = await createTestDb();
    const tenant = await seedTenant(db);
    const start = new Date("2030-10-15T12:00:00Z");
    const booking = await seedBooking(db, tenant.id, { startsAt: start, endsAt: new Date(start.getTime() + 1_800_000), blockedUntil: new Date(start.getTime() + 1_800_000) });
    const now = new Date("2030-10-14T12:00:00Z");
    await enqueueBookingEvent(db, tenant.id, booking.id, "rescheduled", "event-1", now);
    await enqueueBookingEvent(db, tenant.id, booking.id, "rescheduled", "event-1", now);
    await enqueueBookingEvent(db, tenant.id, booking.id, "rescheduled", "event-2", now);
    const rows = await withTenant(db, tenant.id, (tx) => tx.select().from(whatsappQueue));
    expect(rows.filter((row) => row.templateType === "rescheduled")).toHaveLength(2);
  });

  it("respeita a preferência de desativar a notificação", async () => {
    const db = await createTestDb();
    const tenant = await seedTenant(db);
    const booking = await seedBooking(db, tenant.id);
    await withTenant(db, tenant.id, (tx) => tx.insert(tenantNotificationSettings).values({ tenantId: tenant.id, bookingCreated: false, reminderEve: false }));
    await enqueueBookingEvent(db, tenant.id, booking.id, "booking_created", "created", new Date());
    expect(await withTenant(db, tenant.id, (tx) => tx.select().from(whatsappQueue))).toHaveLength(0);
  });
});
