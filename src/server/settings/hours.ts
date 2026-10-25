import { eq } from "drizzle-orm";
import { businessHours } from "@/db/schema";
import type { Db } from "@/db/types";
import {
  WEEKDAYS,
  emptyWeek,
  validateWeeklyHours,
  type WeeklyHours,
} from "@/lib/weekly-hours";
import { withTenant } from "@/server/tenant-db";
import { validationError } from "./errors";

const hm = (t: string) => t.slice(0, 5); // "HH:MM:SS" -> "HH:MM"

export async function getBusinessHours(
  db: Db,
  tenantId: string,
): Promise<WeeklyHours> {
  const rows = await withTenant(db, tenantId, (tx) =>
    tx
      .select()
      .from(businessHours)
      .orderBy(businessHours.weekday, businessHours.startsAt),
  );
  const week = emptyWeek();
  for (const r of rows) {
    week[r.weekday as keyof WeeklyHours].push({
      start: hm(r.startsAt),
      end: hm(r.endsAt),
    });
  }
  return week;
}

/**
 * Substitui o horário de funcionamento (apaga e regrava numa transação).
 * Valida antes de tocar no banco: o horário anterior só muda se tudo estiver certo.
 */
export async function updateBusinessHours(
  db: Db,
  tenantId: string,
  hours: WeeklyHours,
): Promise<void> {
  const errors = validateWeeklyHours(hours);
  const first = WEEKDAYS.find((d) => errors[d]);
  if (first !== undefined) throw validationError({ hours: errors[first]! });

  const values = WEEKDAYS.flatMap((weekday) =>
    hours[weekday].map((r) => ({
      tenantId,
      weekday,
      startsAt: r.start,
      endsAt: r.end,
    })),
  );
  await withTenant(db, tenantId, async (tx) => {
    await tx.delete(businessHours).where(eq(businessHours.tenantId, tenantId));
    if (values.length > 0) await tx.insert(businessHours).values(values);
  });
}
