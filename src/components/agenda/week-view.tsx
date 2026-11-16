"use client";

import { Check } from "lucide-react";
import Link from "next/link";
import { formatTime, dayOfMonth, weekdayShort } from "@/lib/dates";
import { assignLanes, gridRange, weekDates } from "@/lib/week-layout";
import { cn } from "@/lib/utils";
import type { DayAgenda, DayBooking, MonthDay } from "@/server/agenda/panel-queries";
import { localDateOf } from "@/server/agenda/time";
import { STATUS_LABEL, agendaHref } from "./shared";

const PX_PER_HOUR = 56;
const PX_PER_MIN = PX_PER_HOUR / 60;
const AXIS = "56px";
const toMin = (hhmm: string) => Number(hhmm.slice(0, 2)) * 60 + Number(hhmm.slice(3, 5));

/** Pedaço de um bloqueio dentro de um dia da semana (um bloqueio pode atravessar dias). */
type BlockPiece = { id: string; date: string; startMin: number; endMin: number; reason: string | null; professionalId: string | null };

/**
 * Visão "Semana" (computador): sete colunas (domingo a sábado), horas na lateral e
 * um bloco por agendamento na cor do profissional; horários simultâneos ficam
 * lado a lado. O cabeçalho de cada dia abre a visão "Dia"; o bloco abre o detalhe.
 */
export function WeekView({
  week,
  date,
  today,
  days,
  openHours,
  professionalId,
  nowMs,
  selectedId,
  onOpen,
}: {
  /** Agendamentos e bloqueios da semana toda (já com o filtro de profissional). */
  week: DayAgenda;
  /** Qualquer dia da semana mostrada. */
  date: string;
  today: string;
  /** Dados de ocupação/fechado dos dias (de um ou dois meses). */
  days: Map<string, MonthDay>;
  /** Do primeiro horário de abertura ao último de fechamento da semana (minutos); `null` = sem horário. */
  openHours: { startMin: number; endMin: number } | null;
  professionalId: string;
  nowMs: number;
  selectedId: string | null;
  onOpen: (id: string) => void;
}) {
  const tz = week.timezone;
  const dates = weekDates(date);
  const bookingsByDate = new Map<string, DayBooking[]>(dates.map((d) => [d, []]));
  for (const item of week.items) {
    if (item.kind !== "booking" || item.status === "canceled") continue;
    bookingsByDate.get(localDateOf(new Date(item.startsAt), tz))?.push(item);
  }

  const pieces: BlockPiece[] = [];
  for (const item of week.items) {
    if (item.kind !== "block") continue;
    const first = localDateOf(new Date(item.startsAt), tz);
    const last = localDateOf(new Date(new Date(item.endsAt).getTime() - 1), tz);
    for (const d of dates) {
      if (d < first || d > last) continue;
      pieces.push({
        id: item.id,
        date: d,
        startMin: d === first ? toMin(formatTime(new Date(item.startsAt), tz)) : 0,
        endMin: d === last ? toMin(formatTime(new Date(item.endsAt), tz)) || 1440 : 1440,
        reason: item.reason,
        professionalId: item.professionalId,
      });
    }
  }

  const ranges: Array<{ start: number; end: number }> = [];
  for (const list of bookingsByDate.values()) {
    for (const b of list) ranges.push({ start: toMin(b.time), end: toMin(b.endTime) || 1440 });
  }
  const { startMin, endMin } = gridRange(openHours, ranges);
  const hours: number[] = [];
  for (let m = startMin; m < endMin; m += 60) hours.push(m);
  const height = (endMin - startMin) * PX_PER_MIN;
  const nowMin = toMin(formatTime(new Date(nowMs), tz));
  const columns = `${AXIS} repeat(7, minmax(0, 1fr))`;

  return (
    <div className="overflow-hidden rounded-panel border border-line bg-surface" data-testid="week-view">
      {/* Cabeçalho dos dias */}
      <div className="grid border-b border-line" style={{ gridTemplateColumns: columns }}>
        <div />
        {dates.map((d) => {
          const info = days.get(d);
          const count = bookingsByDate.get(d)?.length ?? 0;
          const isToday = d === today;
          const closed = info?.closed ?? false;
          return (
            <Link
              key={d}
              href={agendaHref({ data: d, pro: professionalId, view: "dia" })}
              scroll={false}
              aria-label={`Abrir ${weekdayShort(d)} ${dayOfMonth(d)}${isToday ? " (hoje)" : ""}, ${closed ? "fechado" : `${count} ${count === 1 ? "agendamento" : "agendamentos"}`}`}
              className={cn(
                "flex min-w-0 flex-col items-center gap-1 border-l border-line px-1 py-2.5 hover:bg-primary-soft/50",
                isToday && "bg-primary-soft/40",
              )}
            >
              <span className={cn("text-xs font-bold uppercase tracking-[0.08em]", isToday ? "text-primary" : "text-ink-muted")}>
                {weekdayShort(d)}
              </span>
              <span
                className={cn(
                  "grid size-9 place-items-center rounded-full font-display text-xl font-semibold tabular-nums",
                  isToday ? "bg-primary text-primary-foreground" : "text-foreground",
                )}
              >
                {dayOfMonth(d)}
              </span>
              <span className="text-[0.6875rem] text-ink-muted">
                {closed && count === 0 ? "Fechado" : `${count} agend.`}
              </span>
            </Link>
          );
        })}
      </div>

      {/* Horas e colunas */}
      <div className="grid" style={{ gridTemplateColumns: columns }}>
        <div className="relative" style={{ height }}>
          {hours.map((m) => (
            <span
              key={m}
              className="absolute right-2 -translate-y-1/2 font-display text-xs font-semibold tabular-nums text-ink-muted first:translate-y-0"
              style={{ top: (m - startMin) * PX_PER_MIN }}
            >
              {String(m / 60).padStart(2, "0")}:00
            </span>
          ))}
        </div>

        {dates.map((d) => {
          const info = days.get(d);
          const isToday = d === today;
          const list = bookingsByDate.get(d) ?? [];
          const lanes = assignLanes(list.map((b) => ({ id: b.id, start: toMin(b.time), end: toMin(b.endTime) || 1440 })));
          return (
            <div
              key={d}
              data-date={d}
              className={cn(
                "relative border-l border-line",
                info?.closed && "bg-line/30",
                isToday && !info?.closed && "bg-primary-soft/20",
              )}
              style={{ height }}
            >
              {hours.map((m) => (
                <span
                  key={m}
                  aria-hidden="true"
                  className="absolute inset-x-0 border-t border-line"
                  style={{ top: (m - startMin) * PX_PER_MIN }}
                />
              ))}
              {info?.closed ? (
                <span className="absolute left-2 top-2 text-xs font-medium text-ink-muted/70">Fechado</span>
              ) : null}

              {pieces
                .filter((p) => p.date === d && (p.professionalId === null || professionalId === "todos" || p.professionalId === professionalId))
                .map((p) => (
                  <div
                    key={`${p.id}-${d}`}
                    className="absolute inset-x-1 overflow-hidden rounded-lg border border-line bg-[repeating-linear-gradient(135deg,var(--line)_0,var(--line)_1.5px,transparent_1.5px,transparent_8px)] px-1.5 py-1 text-xs font-semibold text-ink-muted"
                    style={{
                      top: Math.max(0, (p.startMin - startMin) * PX_PER_MIN),
                      height: Math.max(20, (Math.min(p.endMin, endMin) - Math.max(p.startMin, startMin)) * PX_PER_MIN),
                    }}
                  >
                    Bloqueado{p.reason ? ` · ${p.reason}` : ""}
                  </div>
                ))}

              {list.map((b) => {
                const lane = lanes.get(b.id) ?? { lane: 0, lanes: 1 };
                const top = (toMin(b.time) - startMin) * PX_PER_MIN;
                const h = Math.max(24, ((toMin(b.endTime) || 1440) - toMin(b.time)) * PX_PER_MIN - 2);
                const color = b.professional.color ?? "var(--ink-muted)";
                const compact = h < 40 || lane.lanes > 1;
                const service = b.services.map((s) => s.name).join(" + ");
                return (
                  <button
                    key={b.id}
                    type="button"
                    onClick={() => onOpen(b.id)}
                    aria-label={`${b.time}, ${b.customer.name}, ${service}, com ${b.professional.name}, ${STATUS_LABEL[b.status]}`}
                    className={cn(
                      "absolute flex cursor-pointer flex-col items-start justify-start gap-px overflow-hidden rounded-lg py-1 pl-2.5 pr-1.5 text-left text-xs text-foreground outline-none focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-accent",
                      b.status === "completed" && "opacity-70",
                      selectedId === b.id && "ring-2 ring-primary",
                    )}
                    style={{
                      top,
                      height: h,
                      left: `calc(${(lane.lane * 100) / lane.lanes}% + 3px)`,
                      width: `calc(${100 / lane.lanes}% - 6px)`,
                      backgroundColor: `color-mix(in oklch, ${color} 16%, var(--surface))`,
                      boxShadow: `inset 4px 0 0 ${color}`,
                    }}
                  >
                    <span className="flex max-w-full items-center gap-1 font-display font-semibold tabular-nums" style={{ color }}>
                      <span className="truncate">{b.time}</span>
                      {b.status === "confirmed" ? <Check className="size-3 shrink-0" strokeWidth={3} aria-hidden="true" /> : null}
                      {b.status === "no_show" ? <span className="truncate text-danger">Faltou</span> : null}
                      {h < 34 && lane.lanes === 1 ? (
                        <span className="truncate font-sans font-semibold text-foreground">· {b.customer.name}</span>
                      ) : null}
                    </span>
                    {h >= 34 ? <span className="max-w-full truncate font-semibold">{b.customer.name}</span> : null}
                    {!compact && h >= 52 ? <span className="max-w-full truncate text-ink-muted">{service}</span> : null}
                  </button>
                );
              })}

              {isToday && nowMin >= startMin && nowMin <= endMin ? (
                <div
                  aria-hidden="true"
                  className="pointer-events-none absolute inset-x-0 flex items-center"
                  style={{ top: (nowMin - startMin) * PX_PER_MIN }}
                >
                  <span className="-ml-1 size-2.5 flex-none rounded-full bg-primary" />
                  <span className="h-[3px] flex-1 rounded-full bg-[linear-gradient(90deg,#3e07d2,#9429f7,#f581fb)]" />
                </div>
              ) : null}
            </div>
          );
        })}
      </div>
    </div>
  );
}
