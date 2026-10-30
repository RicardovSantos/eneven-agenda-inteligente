import { getDb } from "@/db/client";
import { getCurrentSession } from "@/server/auth/guard";
import { exportTenantAgenda } from "@/server/export/agenda";

export const dynamic = "force-dynamic";
const headers = { "Cache-Control": "private, no-store", "X-Content-Type-Options": "nosniff", "Referrer-Policy": "no-referrer" };

export async function GET(): Promise<Response> {
  const session = await getCurrentSession();
  if (!session?.tenantId || session.role !== "owner" || session.support) return new Response("Não autorizado", { status: 403, headers });
  try {
    const data = await exportTenantAgenda(await getDb(), { userId: session.userId, tenantId: session.tenantId });
    return new Response(JSON.stringify(data), { headers: { ...headers, "Content-Type": "application/json; charset=utf-8", "Content-Disposition": 'attachment; filename="eneven-agenda.json"' } });
  } catch {
    return new Response("Não foi possível exportar a agenda. Tente novamente ou fale com o suporte.", { status: 500, headers });
  }
}
