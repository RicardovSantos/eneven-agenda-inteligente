import { eq } from "drizzle-orm";
import { tenantNotificationSettings, whatsappQueue } from "@/db/schema";
import type { Db } from "@/db/types";
import { withTenant } from "@/server/tenant-db";
import { scheduleRemindersForTenant } from "./scheduler";

/** Enfileiramento posterior à operação de agenda: uma falha não desfaz o agendamento. */
export async function enqueueBookingEvent(db: Db, tenantId: string, bookingId: string, type: "booking_created" | "rescheduled" | "canceled", eventKey: string, now: Date): Promise<void> {
  await withTenant(db, tenantId, async (tx) => {
    const [settings] = await tx.select().from(tenantNotificationSettings).where(eq(tenantNotificationSettings.tenantId, tenantId)).limit(1);
    const enabled = type === "booking_created" ? settings?.bookingCreated : type === "rescheduled" ? settings?.rescheduled : settings?.canceled;
    if (enabled === false) return;
    await tx.insert(whatsappQueue).values({ tenantId, bookingId, templateType: type, eventKey, scheduledFor: now }).onConflictDoNothing();
  });
  await scheduleRemindersForTenant(db, tenantId, now);
}

export async function tryEnqueueBookingEvent(db: Db, tenantId: string, bookingId: string, type: "booking_created" | "rescheduled" | "canceled", eventKey: string, now: Date): Promise<void> {
  try {
    await enqueueBookingEvent(db, tenantId, bookingId, type, eventKey, now);
  } catch (error) {
    console.error("Falha ao enfileirar notificação de agendamento", error instanceof Error ? error.name : "erro desconhecido");
  }
}
