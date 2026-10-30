import { and, eq, gt, inArray, isNull, ne, notInArray } from "drizzle-orm";
import { bookings, plans, tenantNotificationSettings, tenants, whatsappQueue } from "@/db/schema";
import type { Db } from "@/db/types";
import { withTenant } from "@/server/tenant-db";
import { reminderTimes } from "./reminder-times";

/** Enfileira lembretes futuros; o evento inclui o horário para permitir novas remarcações. */
export async function scheduleRemindersForTenant(db: Db, tenantId: string, now: Date = new Date()): Promise<number> {
  const [tenant] = await db.select({ timezone: tenants.timezone, planCode: plans.code })
    .from(tenants).innerJoin(plans, eq(plans.id, tenants.planId)).where(eq(tenants.id, tenantId)).limit(1);
  if (!tenant) throw new Error("Estabelecimento não encontrado.");
  return withTenant(db, tenantId, async (tx) => {
    const [settings] = await tx.select().from(tenantNotificationSettings).where(eq(tenantNotificationSettings.tenantId, tenantId)).limit(1);
    const future = await tx.select({ id: bookings.id, startsAt: bookings.startsAt }).from(bookings)
      .where(and(eq(bookings.tenantId, tenantId), inArray(bookings.status, ["scheduled", "confirmed"]), gt(bookings.startsAt, now)));
    const futureIds = future.map((booking) => booking.id);
    await tx.delete(whatsappQueue).where(and(
      eq(whatsappQueue.tenantId, tenantId), inArray(whatsappQueue.templateType, ["reminder_eve", "reminder_2h"]),
      isNull(whatsappQueue.processedAt), isNull(whatsappQueue.lockedUntil),
      futureIds.length ? notInArray(whatsappQueue.bookingId, futureIds) : undefined,
    ));
    let added = 0;
    for (const booking of future) {
      const times = reminderTimes(booking.startsAt, tenant.timezone);
      const eventKey = booking.startsAt.toISOString();
      // Não deixar que uma remarcação mantenha lembretes do horário anterior.
      await tx.delete(whatsappQueue).where(and(
        eq(whatsappQueue.tenantId, tenantId), eq(whatsappQueue.bookingId, booking.id),
        inArray(whatsappQueue.templateType, ["reminder_eve", "reminder_2h"]),
        ne(whatsappQueue.eventKey, eventKey), isNull(whatsappQueue.processedAt), isNull(whatsappQueue.lockedUntil),
      ));
      for (const item of [
        { templateType: "reminder_eve" as const, enabled: settings?.reminderEve ?? true, scheduledFor: times.eve },
        { templateType: "reminder_2h" as const, enabled: (settings?.reminder2h ?? false) && ["profissional", "studio"].includes(tenant.planCode), scheduledFor: times.twoHours },
      ]) {
        if (!item.enabled) {
          await tx.delete(whatsappQueue).where(and(
            eq(whatsappQueue.tenantId, tenantId), eq(whatsappQueue.bookingId, booking.id),
            eq(whatsappQueue.templateType, item.templateType), eq(whatsappQueue.eventKey, eventKey),
            isNull(whatsappQueue.processedAt), isNull(whatsappQueue.lockedUntil),
          ));
          continue;
        }
        // O worker processa os itens que já chegaram ao horário. Não os apague
        // aqui nem crie lembretes atrasados que nunca foram agendados.
        if (item.scheduledFor <= now) continue;
        const inserted = await tx.insert(whatsappQueue).values({ tenantId, bookingId: booking.id, templateType: item.templateType, scheduledFor: item.scheduledFor, eventKey })
          .onConflictDoNothing().returning({ id: whatsappQueue.id });
        added += inserted.length;
      }
    }
    return added;
  });
}
