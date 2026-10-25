import { and, eq } from "drizzle-orm";
import { businessHours } from "@/db/schema";
import type { Db } from "@/db/types";
import { formatTime } from "@/lib/dates";
import { describeOpening, publicSubtitle } from "@/lib/opening";
import { localDateOf, parseHm, weekdayOf } from "@/server/agenda/time";
import { withTenant } from "@/server/tenant-db";
import type { PublicTenant } from "./tenant";

/**
 * Dados de "agora" do cabeçalho público, no fuso do salão: o dia de hoje (início
 * da faixa de datas) e a linha "Rua X, 120 · Aberto hoje até 19h".
 */
export async function loadPublicHeader(
  db: Db,
  tenant: Pick<PublicTenant, "id" | "timezone" | "address">,
  now: Date = new Date(),
): Promise<{ today: string; subtitle: string | null }> {
  const today = localDateOf(now, tenant.timezone);
  const weekday = weekdayOf(today);
  const rows = await withTenant(db, tenant.id, (tx) =>
    tx
      .select({ start: businessHours.startsAt, end: businessHours.endsAt })
      .from(businessHours)
      .where(and(eq(businessHours.tenantId, tenant.id), eq(businessHours.weekday, weekday))),
  );
  const ranges = rows.map((r) => ({ start: r.start.slice(0, 5), end: r.end.slice(0, 5) }));
  const nowMinutes = parseHm(formatTime(now, tenant.timezone));
  return { today, subtitle: publicSubtitle(tenant.address, describeOpening(ranges, nowMinutes)) };
}
