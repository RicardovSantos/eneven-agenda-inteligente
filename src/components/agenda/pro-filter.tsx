"use client";

import Link from "next/link";
import { useEffect, useRef } from "react";
import { PersonAvatar } from "@/components/media/person-avatar";
import { cn } from "@/lib/utils";
import { agendaHref } from "./shared";

type Pro = { id: string; name: string; color: string | null; photoUrl?: string | null };

const CHIP =
  "flex h-11 shrink-0 items-center gap-2 rounded-full border text-[0.9375rem] whitespace-nowrap outline-none focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent";

/**
 * Filtro de profissional para o celular, numa linha só: "Todos" fica fixo à esquerda e os
 * profissionais correm para o lado. O último chip aparece cortado para mostrar que há mais.
 * Tocar no escolhido de novo volta para "Todos".
 */
export function ProChips({
  professionals,
  selectedId,
  date,
  view,
}: {
  professionals: Pro[];
  /** `null` = todos. */
  selectedId: string | null;
  date: string;
  view: "mes" | "dia";
}) {
  const scroller = useRef<HTMLDivElement>(null);

  // Quem está escolhido pode estar fora da tela (muitos profissionais): traz para o meio da linha.
  useEffect(() => {
    const box = scroller.current;
    const item = box?.querySelector<HTMLElement>("[aria-current='true']");
    if (!box || !item) return;
    box.scrollTo({ left: Math.max(0, item.offsetLeft - (box.clientWidth - item.offsetWidth) / 2) });
  }, [selectedId]);

  return (
    <div
      role="group"
      aria-label="Profissional"
      className="-mx-4 flex items-center gap-2 pl-4 lg:hidden"
    >
      <Link
        href={agendaHref({ data: date, pro: "todos", view })}
        scroll={false}
        aria-current={selectedId === null ? "true" : undefined}
        className={cn(CHIP, "px-4", chipTone(selectedId === null))}
      >
        Todos
      </Link>
      <span aria-hidden="true" className="h-6 w-px shrink-0 bg-line" />
      <div className="relative min-w-0 flex-1">
        <div
          ref={scroller}
          data-rolagem
          className="relative flex gap-2 overflow-x-auto pr-8 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
        >
          {professionals.map((p) => {
            const active = selectedId === p.id;
            return (
              <Link
                key={p.id}
                // Tocar de novo no escolhido volta para "Todos".
                href={agendaHref({ data: date, pro: active ? "todos" : p.id, view })}
                scroll={false}
                aria-current={active ? "true" : undefined}
                className={cn(CHIP, "pl-1 pr-4", chipTone(active))}
              >
                <PersonAvatar name={p.name} color={p.color} photoUrl={p.photoUrl} size={30} />
                {p.name}
              </Link>
            );
          })}
        </div>
        {/* Esmaece a borda direita: sugere que a linha continua. */}
        <span
          aria-hidden="true"
          className="pointer-events-none absolute inset-y-0 right-0 w-10 bg-gradient-to-r from-transparent to-canvas"
        />
      </div>
    </div>
  );
}

function chipTone(active: boolean) {
  return active
    ? "border-primary bg-primary-soft font-semibold text-primary"
    : "border-line bg-surface font-medium text-foreground hover:bg-primary-soft/60";
}
