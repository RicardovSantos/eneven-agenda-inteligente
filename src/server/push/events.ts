import { pushEvents } from "@/db/schema";
import type { TenantTx } from "@/server/tenant-db";
import { pushAvailable } from "./mode";

type EventType = "booking_created" | "booking_canceled" | "booking_rescheduled";

/** Mesmo commit do agendamento; sem dados pessoais. Em produção só com o envio real ligado. */
export async function enqueueTestPushEvent(tx: TenantTx, tenantId: string, bookingId: string, eventType: EventType, eventKey: string, now: Date): Promise<void> {
  if (!pushAvailable()) return;
  await tx.insert(pushEvents).values({ tenantId, bookingId, eventType, eventKey, createdAt: now }).onConflictDoNothing();
}
