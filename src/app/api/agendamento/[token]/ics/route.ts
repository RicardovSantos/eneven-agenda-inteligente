import { getDb } from "@/db/client";
import { PUBLIC_HOST } from "@/lib/brand";
import { formatBRL } from "@/lib/format";
import { buildIcs } from "@/lib/ics";
import { getManageView } from "@/server/public/manage";
import { currentClientIp } from "@/server/security/client-ip";
import { limitPublicRead } from "@/server/security/limits";

export const dynamic = "force-dynamic";

const NOT_FOUND = () => new Response("Not found", { status: 404, headers: { "Cache-Control": "no-store" } });

/**
 * "Adicionar ao calendário": arquivo .ics do agendamento do token. O token é a
 * única credencial; inválido ou cancelado devolve 404. A resposta nunca é
 * guardada em cache e o token não entra no conteúdo do arquivo.
 */
export async function GET(
  _request: Request,
  ctx: RouteContext<"/api/agendamento/[token]/ics">,
): Promise<Response> {
  const limit = limitPublicRead(await currentClientIp());
  if (!limit.ok) {
    return new Response("Too many requests", {
      status: 429,
      headers: { "Retry-After": String(limit.retryAfterSec), "Cache-Control": "no-store" },
    });
  }

  const { token } = await ctx.params;
  const view = await getManageView(await getDb(), token);
  if (!view || view.booking.status === "canceled") return NOT_FOUND();

  const { tenant, booking } = view;
  const ics = buildIcs({
    uid: `${booking.bookingId}@${PUBLIC_HOST}`,
    title: `${booking.services.map((s) => s.name).join(", ")} — ${tenant.name}`,
    startsAt: new Date(booking.startsAt),
    endsAt: new Date(booking.endsAt),
    location: tenant.address,
    description: `Com ${booking.professionalName}. ${formatBRL(booking.totalCents)}, pago no local.`,
  });

  return new Response(ics, {
    headers: {
      "Content-Type": "text/calendar; charset=utf-8",
      "Content-Disposition": 'attachment; filename="agendamento.ics"',
      "Cache-Control": "private, no-store",
      "Referrer-Policy": "no-referrer",
      "X-Content-Type-Options": "nosniff",
    },
  });
}
