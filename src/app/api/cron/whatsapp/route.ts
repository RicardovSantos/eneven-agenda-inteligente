import { getDb } from "@/db/client";
import { tenants } from "@/db/schema";
import { safeEqual } from "@/server/auth/signed-cookie";
import { processQueue } from "@/server/whatsapp/queue";
import { scheduleRemindersForTenant } from "@/server/whatsapp/scheduler";

export const dynamic = "force-dynamic";

/** Chamado por um agendador externo. Sem segredo configurado, fica desligado. */
export async function POST(request: Request) {
  const secret = process.env.CRON_SECRET;
  if (!secret) return new Response("Serviço não configurado", { status: 503 });
  const auth = request.headers.get("authorization") ?? "";
  if (!safeEqual(auth, `Bearer ${secret}`)) return new Response("Não autorizado", { status: 401 });
  const db = await getDb();
  const now = new Date();
  const rows = await db.select({ id: tenants.id }).from(tenants);
  let scheduled = 0;
  for (const tenant of rows) scheduled += await scheduleRemindersForTenant(db, tenant.id, now);
  const result = await processQueue(db, 20, now);
  return Response.json({ scheduled, ...result });
}
