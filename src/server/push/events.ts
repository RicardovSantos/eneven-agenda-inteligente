import { pushEvents } from "@/db/schema";
import type { TenantTx } from "@/server/tenant-db";

type EventType = "booking_created" | "booking_canceled" | "booking_rescheduled";

/** Mesmo commit do agendamento; sem dados pessoais. Produção permanece desligada. */
export async function enqueueTestPushEvent(tx: TenantTx, tenantId: string, bookingId: string, eventType: EventType, eventKey: string, now: Date): Promise<void> {
  if (process.env.NODE_ENV === "production") return;
  await tx.insert(pushEvents).values({ tenantId, bookingId, eventType, eventKey, createdAt: now }).onConflictDoNothing();
}
