"use client";

import Link from "next/link";
import { cn } from "@/lib/utils";
import { addDaysToDate, weekdayOf } from "@/server/agenda/time";
import type { MonthDay } from "@/server/agenda/panel-queries";
import { agendaHref } from "./shared";

const WEEKDAYS = ["Dom", "Seg", "Ter", "Qua", "Qui", "Sex", "Sáb"];
const MONTHS = [
  "janeiro",
  "fevereiro",
  "março",
  "abril",
  "maio",
  "junho",
  "julho",
  "agosto",
  "setembro",
  "outubro",
  "novembro",
  "dezembro",
];

const countLabel = (count: number) => `${count} ${count === 1 ? "agendamento" : "agendamentos"}`;

/**
 * Mês com barra de ocupação por dia (≥ 1024px). Cada dia é um link que troca o
 * dia selecionado na URL; hoje tem anel, o dia selecionado fundo `--primary-soft`.
 */
export function MonthView({
  days,
  selected,
  today,
  professionalId,
}: {
  days: MonthDay[];
  selected: string;
  today: string;
  professionalId: string;
}) {
  const first = days[0].date;
  const lead = weekdayOf(first);
  const rows = Math.ceil((lead + days.length) / 7);
  const cells: Array<{ date: string; day: MonthDay | null }> = [];
  for (let i = 0; i < rows * 7; i++) {
    const date = addDaysToDate(first, i - lead);
    cells.push({ date, day: days.find((d) => d.date === date) ?? null });
  }

  return (
    <div className="overflow-hidden rounded-panel border border-line bg-surface">
      <div className="grid grid-cols-7 border-b border-line">
        {WEEKDAYS.map((weekday) => (
          <div key={weekday} className="px-2 py-3 text-[13px] min-[1440px]:px-3.5 font-semibold text-ink-muted">
            {weekday}
          </div>
        ))}
      </div>
      <div className="grid grid-cols-7">
        {cells.map(({ date, day }) => {
          const other = day === null;
          const isToday = date === today;
          const isSelected = date === selected;
          const past = !other && date < today;
          const dayNumber = Number(date.slice(8, 10));
          const monthName = MONTHS[Number(date.slice(5, 7)) - 1];
          const count = day?.count ?? 0;
          return (
            <Link
              key={date}
              href={agendaHref({ data: date, pro: professionalId, view: "mes" })}
              scroll={false}
              aria-current={isToday ? "date" : isSelected ? "true" : undefined}
              aria-label={`${dayNumber} de ${monthName}${count ? `, ${countLabel(count)}` : ""}${day?.closed ? ", fechado" : ""}`}
              className={cn(
                "flex min-h-[104px] flex-col items-start justify-between gap-2.5 border-b border-r border-line px-2 py-3 text-left text-foreground min-[1440px]:px-3.5",
                isSelected ? "bg-primary-soft" : "bg-surface hover:bg-primary-soft/50",
                isToday && "shadow-[inset_0_0_0_2px_var(--primary)]",
              )}
            >
              <span
                className={cn(
                  "font-display text-base font-semibold",
                  other ? "text-ink-muted/50" : past ? "text-ink-muted" : "text-foreground",
                  isToday && "text-primary",
                )}
              >
                {dayNumber}
              </span>
              {day && count > 0 ? (
                <span className="flex w-full min-w-0 flex-col gap-1.5">
                  <span
                    role="img"
                    aria-label={countLabel(count)}
                    title={countLabel(count)}
                    className="font-display text-sm font-semibold tabular-nums text-foreground"
                  >
                    {count}
                  </span>
                  {day.closed ? null : (
                    <span className="block h-1 overflow-hidden rounded-full bg-line">
                      <span
                        className={cn("block h-full rounded-full", past ? "bg-[#B9A6F4] dark:bg-[#5d4b94]" : "bg-primary")}
                        style={{ width: `${Math.max(4, Math.round(day.occupancy * 100))}%` }}
                      />
                    </span>
                  )}
                </span>
              ) : null}
              {day?.closed ? <span className="text-xs text-ink-muted/80">Fechado</span> : null}
            </Link>
          );
        })}
      </div>
    </div>
  );
}
