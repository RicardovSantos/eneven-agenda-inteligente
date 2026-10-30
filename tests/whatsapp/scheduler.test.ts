import { describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import { bookings, whatsappQueue } from "@/db/schema";
import { withTenant } from "@/server/tenant-db";
import { scheduleRemindersForTenant } from "@/server/whatsapp/scheduler";
import { seedBooking, seedTenant } from "../helpers/agenda-fixtures";
import { createTestDb } from "../helpers/test-db";

describe("agendamento de lembretes", () => {
  it("agenda véspera por estabelecimento e não duplica na repetição", async () => {
    const db = await createTestDb();
    const a = await seedTenant(db);
    const b = await seedTenant(db);
    const start = new Date("2030-10-15T12:00:00Z");
    const booking = await seedBooking(db, a.id, { startsAt: start, endsAt: new Date(start.getTime() + 1_800_000), blockedUntil: new Date(start.getTime() + 1_800_000) });
    const now = new Date("2030-10-14T12:00:00Z");
    expect(await scheduleRemindersForTenant(db, a.id, now)).toBe(1);
    expect(await scheduleRemindersForTenant(db, a.id, now)).toBe(0);
    expect(await scheduleRemindersForTenant(db, b.id, now)).toBe(0);
    const [row] = await withTenant(db, a.id, (tx) => tx.select().from(whatsappQueue));
    expect(row.bookingId).toBe(booking.id);
    expect(row.scheduledFor.toISOString()).toBe("2030-10-14T21:00:00.000Z");
    expect(await scheduleRemindersForTenant(db, a.id, new Date("2030-10-14T21:01:00Z"))).toBe(0);
    expect(await withTenant(db, a.id, (tx) => tx.select().from(whatsappQueue))).toHaveLength(1);
    const moved = new Date("2030-10-16T12:00:00Z");
    await withTenant(db, a.id, (tx) => tx.update(bookings).set({ startsAt: moved, endsAt: new Date(moved.getTime() + 1_800_000), blockedUntil: new Date(moved.getTime() + 1_800_000) }).where(eq(bookings.id, booking.id)));
    expect(await scheduleRemindersForTenant(db, a.id, now)).toBe(1);
    const rows = await withTenant(db, a.id, (tx) => tx.select().from(whatsappQueue));
    expect(rows).toHaveLength(1);
    expect(rows[0].scheduledFor.toISOString()).toBe("2030-10-15T21:00:00.000Z");
    await withTenant(db, a.id, (tx) => tx.update(bookings).set({ status: "canceled" }).where(eq(bookings.id, booking.id)));
    expect(await scheduleRemindersForTenant(db, a.id, now)).toBe(0);
    expect(await withTenant(db, a.id, (tx) => tx.select().from(whatsappQueue))).toHaveLength(0);
  });
});
