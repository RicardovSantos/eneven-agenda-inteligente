"use client";

import Link from "next/link";
import { cn } from "@/lib/utils";
import { addDaysToDate, weekdayOf } from "@/server/agenda/time";
import type { MonthDay } from "@/server/agenda/panel-queries";
import { dayOfMonth, weekdayShort } from "@/lib/dates";
import { agendaHref } from "./shared";

/** Faixa da semana (< 1024px): Dom a Sáb com barrinha de ocupação; fechado sem barra. */
export function WeekStrip({
  selected,
  info,
  professionalId,
}: {
  selected: string;
  /** Dados dos dias (de um ou dois meses). */
  info: Map<string, MonthDay>;
  professionalId: string;
}) {
  const start = addDaysToDate(selected, -weekdayOf(selected));
  const week = Array.from({ length: 7 }, (_, i) => addDaysToDate(start, i));

  return (
    <div role="tablist" aria-label="Dias da semana" className="grid grid-cols-7 gap-1">
      {week.map((date) => {
        const sel = date === selected;
        const day = info.get(date);
        const level = day && !day.closed && day.count > 0 ? Math.max(1, Math.round(day.occupancy * 3)) : 0;
        return (
          <Link
            key={date}
            href={agendaHref({ data: date, pro: professionalId })}
            scroll={false}
            role="tab"
            aria-selected={sel}
            aria-label={`${weekdayShort(date)} ${dayOfMonth(date)}${day?.closed ? ", fechado" : ""}`}
            className={cn(
              "flex min-h-16 flex-col items-center gap-1 rounded-[14px] py-2",
              sel ? "bg-primary text-primary-foreground" : "bg-transparent text-foreground",
            )}
          >
            <span className={cn("text-xs font-medium", sel ? "text-primary-foreground/85" : "text-ink-muted")}>
              {weekdayShort(date)}
            </span>
            <span className="font-display text-[17px] font-semibold tabular-nums">{dayOfMonth(date)}</span>
            <span
              aria-hidden="true"
              className={cn("block h-1 rounded-full", sel ? "bg-spark" : "bg-[#B9A6F4] dark:bg-[#5d4b94]")}
              style={{ width: level * 5 }}
            />
          </Link>
        );
      })}
    </div>
  );
}
