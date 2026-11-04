"use client";

import { useEffect, useMemo, useRef } from "react";
import type { DayAgenda, DayItem } from "@/server/agenda/panel-queries";
import { BlockRow, BookingRow } from "./day-list";

/** Dia local ("yyyy-MM-dd") de um instante, no fuso do estabelecimento. */
function localDate(iso: string, timezone: string): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: timezone, year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date(iso));
}

function heading(date: string): string {
  const text = new Intl.DateTimeFormat("pt-BR", { timeZone: "UTC", weekday: "long", day: "numeric", month: "long" }).format(new Date(`${date}T12:00:00Z`));
  return text.charAt(0).toUpperCase() + text.slice(1);
}

/**
 * Lista do mês: todos os agendamentos (menos os cancelados) e bloqueios do mês, agrupados
 * por dia, na ordem do tempo. Abre rolada até o dia escolhido (ou o próximo com itens).
 */
export function MonthList({
  month,
  focusDate,
  canDeleteBlock,
  onOpen,
  onDeleteBlock,
  photos,
}: {
  month: DayAgenda;
  focusDate: string;
  onOpen: (id: string) => void;
  canDeleteBlock: (professionalId: string | null) => boolean;
  onDeleteBlock: (id: string) => void;
  photos: Record<string, string | null>;
}) {
  const groups = useMemo(() => {
    const byDate = new Map<string, DayItem[]>();
    for (const item of month.items) {
      if (item.kind === "booking" && item.status === "canceled") continue;
      const key = localDate(item.startsAt, month.timezone);
      byDate.set(key, [...(byDate.get(key) ?? []), item]);
    }
    return [...byDate.entries()].sort(([a], [b]) => a.localeCompare(b));
  }, [month]);

  const target = groups.find(([date]) => date >= focusDate)?.[0];
  const ref = useRef<HTMLElement | null>(null);
  useEffect(() => {
    ref.current?.scrollIntoView({ block: "start" });
  }, [target, month.date]);

  if (groups.length === 0) {
    return <p className="m-0 text-[0.9375rem] leading-snug text-ink-muted">Nenhum agendamento neste mês.</p>;
  }

  return (
    <div className="flex flex-col gap-5">
      {groups.map(([date, items]) => (
        <section key={date} ref={date === target ? ref : undefined} aria-label={heading(date)} className="flex scroll-mt-2 flex-col gap-2">
          <h3 className="m-0 font-display text-sm font-semibold text-ink-muted">{heading(date)}</h3>
          <ol className="m-0 flex list-none flex-col gap-2 p-0">
            {items.map((item) => (
              <li key={`${item.kind}-${item.id}`}>
                {item.kind === "booking" ? (
                  <BookingRow booking={item} onOpen={onOpen} photoUrl={photos[item.professional.id] ?? null} />
                ) : (
                  <BlockRow block={item} onDelete={canDeleteBlock(item.professionalId) ? onDeleteBlock : null} />
                )}
              </li>
            ))}
          </ol>
        </section>
      ))}
    </div>
  );
}
