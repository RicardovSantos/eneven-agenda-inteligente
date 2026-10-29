"use client";

import { Search } from "lucide-react";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { cn } from "@/lib/utils";
import { clientsHref, type ClientFilterParam } from "./view";

const CHIPS: Array<{ value: ClientFilterParam | undefined; full: string; short: string }> = [
  { value: undefined, full: "Todos", short: "Todos" },
  { value: "com-horario", full: "Com horário marcado", short: "Com horário" },
  { value: "sem-voltar", full: "Sem voltar há 60 dias", short: "Sem voltar há 60 dias" },
];

/**
 * Busca e filtros da lista de clientes. O estado vive na URL (`?q=&filtro=`);
 * mudar a busca ou o filtro volta para a primeira página e mantém a ficha aberta.
 */
export function ClientFilters({
  query,
  filter,
  selectedId,
}: {
  query: string;
  filter: ClientFilterParam | undefined;
  selectedId?: string;
}) {
  const router = useRouter();
  const [value, setValue] = useState(query);
  const sent = useRef(query);

  // Busca "ao digitar": espera uma pausa para não consultar a cada tecla.
  useEffect(() => {
    const q = value.trim();
    if (q === sent.current) return;
    const timer = setTimeout(() => {
      sent.current = q;
      router.replace(clientsHref({ id: selectedId, q: q || undefined, filtro: filter }), { scroll: false });
    }, 300);
    return () => clearTimeout(timer);
  }, [value, filter, selectedId, router]);

  return (
    <div className="flex flex-col gap-3 lg:flex-row lg:flex-wrap lg:items-center">
      <label className="flex min-h-11 items-center gap-2.5 rounded-field border border-line bg-canvas px-3.5 text-ink-muted focus-within:border-accent focus-within:outline-2 focus-within:outline-offset-2 focus-within:outline-accent lg:max-w-[420px] lg:flex-1 lg:basis-[280px] lg:bg-surface">
        <Search className="size-[18px] shrink-0" aria-hidden="true" />
        <span className="sr-only">Buscar cliente</span>
        <input
          type="search"
          value={value}
          onChange={(e) => setValue(e.target.value)}
          placeholder="Buscar por nome ou WhatsApp"
          maxLength={80}
          autoComplete="off"
          className="min-w-0 flex-1 bg-transparent text-base text-foreground outline-none placeholder:text-ink-muted lg:text-[0.9375rem]"
        />
      </label>
      <div role="group" aria-label="Filtrar clientes" className="flex flex-wrap gap-2">
        {CHIPS.map((chip) => {
          const on = chip.value === filter;
          return (
            <button
              key={chip.full}
              type="button"
              aria-pressed={on}
              onClick={() =>
                router.replace(clientsHref({ id: selectedId, q: query || undefined, filtro: chip.value }), {
                  scroll: false,
                })
              }
              className={cn(
                "min-h-9 cursor-pointer rounded-full border px-3 text-[0.8125rem] lg:min-h-10 lg:px-3.5 lg:text-sm",
                on
                  ? "border-primary bg-primary-soft font-semibold text-primary"
                  : "border-line bg-surface font-medium text-foreground hover:bg-primary-soft/60",
              )}
            >
              <span className="lg:hidden">{chip.short}</span>
              <span className="max-lg:hidden">{chip.full}</span>
            </button>
          );
        })}
      </div>
    </div>
  );
}
