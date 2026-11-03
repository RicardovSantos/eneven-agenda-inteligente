"use client";

import { formatTime } from "@/lib/dates";
import { cn } from "@/lib/utils";
import type { DayAgenda } from "@/server/agenda/panel-queries";
import { PersonAvatar } from "@/components/media/person-avatar";
import { STATUS_CARD, STATUS_LABEL } from "./shared";

const PX_PER_HOUR = 64;
const PX_PER_MIN = PX_PER_HOUR / 60;
const toMin = (hhmm: string) => Number(hhmm.slice(0, 2)) * 60 + Number(hhmm.slice(3, 5));

export type ColumnPro = { id: string; name: string; color: string | null; photoUrl?: string | null };

/**
 * Visão "Dia": uma coluna por profissional (ou só a do filtro), horas na
 * vertical (da abertura ao fechamento) e blocos proporcionais à duração.
 * Bloqueios aparecem listrados em cinza; a linha do "agora" fica no minuto exato.
 */
export function DayColumns({
  day,
  professionals: activeProfessionals,
  isToday,
  nowMs,
  onOpen,
}: {
  day: DayAgenda;
  professionals: ColumnPro[];
  isToday: boolean;
  nowMs: number;
  onOpen: (id: string) => void;
}) {
  // Profissional inativo só ganha coluna quando tem agendamento no dia.
  const professionals = [...activeProfessionals];
  for (const item of day.items) {
    if (item.kind === "booking" && item.status !== "canceled" && !professionals.some((p) => p.id === item.professional.id)) {
      professionals.push({ id: item.professional.id, name: `${item.professional.name} (inativo)`, color: item.professional.color, photoUrl: null });
    }
  }
  const bookings = day.items.filter((i) => i.kind === "booking" && i.status !== "canceled");
  const blocks = day.items.filter((i) => i.kind === "block");

  let startMin = day.hours?.startMin ?? 8 * 60;
  let endMin = day.hours?.endMin ?? 19 * 60;
  for (const item of day.items) {
    if (item.kind === "booking" && item.status === "canceled") continue;
    startMin = Math.min(startMin, toMin(item.time));
    endMin = Math.max(endMin, toMin(item.endTime) || 1440);
  }
  startMin = Math.floor(startMin / 60) * 60;
  endMin = Math.min(1440, Math.ceil(endMin / 60) * 60);
  const hours: number[] = [];
  for (let m = startMin; m < endMin; m += 60) hours.push(m);
  const height = (endMin - startMin) * PX_PER_MIN;

  const nowMin = toMin(formatTime(new Date(nowMs), day.timezone));
  const showNow = isToday && nowMin >= startMin && nowMin <= endMin;

  return (
    <div className="overflow-x-auto rounded-panel border border-line bg-surface" data-testid="day-columns">
      <div
        className="grid min-w-fit"
        style={{ gridTemplateColumns: `56px repeat(${professionals.length}, minmax(160px, 1fr))` }}
      >
        <div className="border-b border-line" />
        {professionals.map((pro) => (
          <div
            key={pro.id}
            className="flex items-center gap-2 border-b border-l border-line px-3 py-3 text-sm font-semibold"
          >
            <PersonAvatar name={pro.name} color={pro.color} photoUrl={pro.photoUrl} size={26} />
            <span className="truncate">{pro.name}</span>
          </div>
        ))}

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

        {professionals.map((pro) => (
          <div key={pro.id} className="relative border-l border-line" style={{ height }}>
            {hours.map((m) => (
              <span
                key={m}
                aria-hidden="true"
                className="absolute inset-x-0 border-t border-line"
                style={{ top: (m - startMin) * PX_PER_MIN }}
              />
            ))}

            {blocks
              .filter((b) => b.kind === "block" && (b.professionalId === null || b.professionalId === pro.id))
              .map((b) => {
                if (b.kind !== "block") return null;
                const top = (toMin(b.time) - startMin) * PX_PER_MIN;
                const h = Math.max(20, ((toMin(b.endTime) || 1440) - toMin(b.time)) * PX_PER_MIN);
                return (
                  <div
                    key={b.id}
                    className="absolute inset-x-1 overflow-hidden rounded-lg border border-line bg-[repeating-linear-gradient(135deg,var(--line)_0,var(--line)_1.5px,transparent_1.5px,transparent_8px)] px-2 py-1 text-xs font-semibold text-ink-muted"
                    style={{ top, height: h }}
                  >
                    Bloqueado{b.reason ? ` · ${b.reason}` : ""}
                  </div>
                );
              })}

            {bookings
              .filter((b) => b.kind === "booking" && b.professional.id === pro.id)
              .map((b) => {
                if (b.kind !== "booking") return null;
                const top = (toMin(b.time) - startMin) * PX_PER_MIN;
                const h = Math.max(24, ((toMin(b.endTime) || 1440) - toMin(b.time)) * PX_PER_MIN);
                return (
                  <button
                    key={b.id}
                    type="button"
                    onClick={() => onOpen(b.id)}
                    aria-label={`${b.time}, ${b.customer.name}, ${b.services.map((s) => s.name).join(" e ")}, ${STATUS_LABEL[b.status]}`}
                    className={cn(
                      "absolute inset-x-1 flex cursor-pointer flex-col items-start justify-center gap-0.5 overflow-hidden rounded-lg px-2 py-1 text-left text-xs text-foreground",
                      STATUS_CARD[b.status],
                    )}
                    style={{ top, height: h }}
                  >
                    <span className="max-w-full truncate font-display font-semibold tabular-nums">
                      {b.time} · {b.customer.name}
                    </span>
                    {h >= 40 ? (
                      <span className="max-w-full truncate text-ink-muted">{b.services.map((s) => s.name).join(" + ")}</span>
                    ) : null}
                  </button>
                );
              })}
          </div>
        ))}

        {showNow ? (
          <div
            aria-hidden="true"
            className="pointer-events-none relative col-span-full flex items-center"
            style={{ gridRow: 3, gridColumn: "1 / -1", height: 0, top: -height + (nowMin - startMin) * PX_PER_MIN }}
          >
            <span className="ml-[50px] size-2.5 flex-none rounded-full bg-primary" />
            <span className="h-[3px] flex-1 rounded-full bg-[linear-gradient(90deg,#3e07d2,#9429f7,#f581fb)]" />
          </div>
        ) : null}
      </div>
      {professionals.length === 0 ? (
        <p className="p-6 text-sm text-ink-muted">Nenhum profissional ativo.</p>
      ) : null}
    </div>
  );
}
