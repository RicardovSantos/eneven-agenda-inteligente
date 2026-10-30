import { and, count, eq, gte, inArray, lt } from "drizzle-orm";
import { whatsappMessages } from "@/db/schema";
import type { Db } from "@/db/types";
import { addDaysToDate, localDateOf, zonedInstant } from "@/server/agenda/time";
import { checkMetaDailyLimit } from "@/server/whatsapp/quota";

/** Agregados globais; usar apenas após verificar superadministrador. */
export async function getWhatsAppMetrics(db: Db, now: Date = new Date()) {
  const first = `${localDateOf(now, "America/Sao_Paulo").slice(0, 7)}-01`;
  const next = `${addDaysToDate(`${first.slice(0, 7)}-28`, 4).slice(0, 7)}-01`;
  const [row] = await db.select({ sent: count() }).from(whatsappMessages).where(and(
    eq(whatsappMessages.direction, "outbound"), inArray(whatsappMessages.status, ["sent", "delivered", "read"]),
    gte(whatsappMessages.createdAt, zonedInstant(first, 0, "America/Sao_Paulo")), lt(whatsappMessages.createdAt, zonedInstant(next, 0, "America/Sao_Paulo")),
  ));
  return { daily: await checkMetaDailyLimit(db, now), monthlySent: row.sent, estimatedCents: Math.round(row.sent * 3.5) };
}
