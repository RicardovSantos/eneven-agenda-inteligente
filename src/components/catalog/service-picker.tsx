"use client";

import { ChevronDown } from "lucide-react";
import { useId, useMemo, useState } from "react";
import { formatDuration } from "@/lib/format";
import { groupServices, OTHER_CATEGORY, showGroupHeaders } from "@/lib/service-groups";
import { cn } from "@/lib/utils";

export type PickableService = {
  id: string;
  name: string;
  durationMin: number;
  categoryName: string | null;
};

/**
 * Escolha dos serviços de um profissional, agrupada por categoria: cada categoria é um
 * cartão que abre e fecha (começam fechadas) e mostra "x de y" marcados mesmo recolhida.
 * Sem nenhuma categoria cadastrada, é a lista simples de sempre.
 */
export function ServicePicker({
  services,
  selectedIds,
  onToggle,
}: {
  services: PickableService[];
  selectedIds: string[];
  onToggle: (id: string, on: boolean) => void;
}) {
  const groups = useMemo(() => groupServices(services), [services]);
  const grouped = showGroupHeaders(groups);
  const baseId = useId();
  const [open, setOpen] = useState<Set<string>>(() => new Set());
  const selected = useMemo(() => new Set(selectedIds), [selectedIds]);

  const toggleOpen = (key: string) =>
    setOpen((current) => {
      const next = new Set(current);
      if (!next.delete(key)) next.add(key);
      return next;
    });

  const row = (s: PickableService) => (
    <label
      key={s.id}
      className="flex min-h-11 cursor-pointer items-center gap-2.5 px-4 py-1 hover:bg-primary-soft/40"
    >
      <input
        type="checkbox"
        checked={selected.has(s.id)}
        onChange={(e) => onToggle(s.id, e.target.checked)}
        className="size-[18px] shrink-0 accent-primary"
      />
      <span className={cn("min-w-0 flex-1 truncate", selected.has(s.id) && "font-semibold")}>{s.name}</span>
      <span className="shrink-0 text-sm tabular-nums text-ink-muted">{formatDuration(s.durationMin)}</span>
    </label>
  );

  if (!grouped) {
    return (
      <div className="flex flex-col overflow-hidden rounded-field border border-line">
        {services.map((s, i) => (
          <div key={s.id} className={cn(i > 0 && "border-t border-line/60")}>
            {row(s)}
          </div>
        ))}
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-2.5">
      {groups.map((group) => {
        const key = group.category ?? "";
        const isOpen = open.has(key);
        const marked = group.items.filter((s) => selected.has(s.id)).length;
        const name = group.category ?? OTHER_CATEGORY;
        const panelId = `${baseId}-${group.items[0]!.id}`;
        return (
          <section
            key={key}
            className={cn(
              "overflow-hidden rounded-field border bg-surface",
              isOpen ? "border-primary" : "border-line",
            )}
          >
            <h4 className="m-0">
              <button
                type="button"
                aria-expanded={isOpen}
                aria-controls={panelId}
                onClick={() => toggleOpen(key)}
                className={cn(
                  "flex min-h-12 w-full cursor-pointer items-center gap-2.5 px-4 py-2 text-left outline-none focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-accent",
                  isOpen && "bg-primary-soft/40",
                )}
              >
                <span className="min-w-0 truncate font-display text-[1.0625rem] font-semibold">{name}</span>
                <span
                  className={cn(
                    "shrink-0 rounded-full px-2.5 py-0.5 text-[0.8125rem] font-semibold tabular-nums",
                    marked > 0 ? "bg-primary-soft text-primary" : "bg-line/70 text-ink-muted",
                  )}
                >
                  {marked} de {group.items.length}
                </span>
                <ChevronDown
                  className={cn("ml-auto size-5 shrink-0 text-ink-muted transition-transform", isOpen && "rotate-180 text-primary")}
                  aria-hidden="true"
                />
              </button>
            </h4>
            {/* Fechada, a lista sai da tela mas as escolhas continuam valendo (estado do formulário). */}
            <div id={panelId} hidden={!isOpen} className="border-t border-line">
              {group.items.map((s, i) => (
                <div key={s.id} className={cn(i > 0 && "border-t border-line/60")}>
                  {row(s)}
                </div>
              ))}
            </div>
          </section>
        );
      })}
    </div>
  );
}
