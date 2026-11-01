import { tenants } from "@/db/schema";
import type { Db } from "@/db/types";
import { processQueue } from "./queue";
import { scheduleRemindersForTenant } from "./scheduler";

/** Quantas mensagens um ciclo envia no máximo (o próximo ciclo pega o resto). */
export const CYCLE_BATCH = 20;

/**
 * Um ciclo do WhatsApp: enfileira os lembretes que passaram a valer e envia o
 * que está na fila. Usado pela rota protegida `/api/cron/whatsapp` e pelo
 * relógio interno do app, então os dois fazem exatamente o mesmo.
 */
export async function runWhatsAppCycle(db: Db, now: Date = new Date()) {
  const rows = await db.select({ id: tenants.id }).from(tenants);
  let scheduled = 0;
  for (const tenant of rows) scheduled += await scheduleRemindersForTenant(db, tenant.id, now);
  const result = await processQueue(db, CYCLE_BATCH, now);
  return { scheduled, ...result };
}
