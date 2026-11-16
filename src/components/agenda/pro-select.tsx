"use client";

import { Check, ChevronDown } from "lucide-react";
import { useEffect, useId, useRef, useState } from "react";
import { cn } from "@/lib/utils";

export type ProSelectOption = { id: string; name: string; color: string | null };

/** Bolinha na cor da etiqueta do profissional (cinza para "Qualquer profissional"). */
export function ProDot({ color, className }: { color: string | null; className?: string }) {
  return (
    <span
      aria-hidden="true"
      className={cn("inline-block size-3 shrink-0 rounded-full", className)}
      style={{ backgroundColor: color ?? "#B9B4CE" }}
    />
  );
}

/**
 * Seletor de profissional com a bolinha da cor de cada um (o `<select>` nativo não
 * mostra cor nas opções). Teclado: setas, Enter, Esc; fecha ao tocar fora.
 */
export function ProSelect({
  labelledBy,
  value,
  options,
  onChange,
}: {
  /** `id` do título da seção, para o nome acessível. */
  labelledBy: string;
  value: string;
  options: ProSelectOption[];
  onChange: (id: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(0);
  const root = useRef<HTMLDivElement>(null);
  const buttonId = useId();
  const listId = useId();
  const selectedIndex = Math.max(0, options.findIndex((o) => o.id === value));
  const selected = options[selectedIndex];

  useEffect(() => {
    if (!open) return;
    const onPointerDown = (event: PointerEvent) => {
      if (!root.current?.contains(event.target as Node)) setOpen(false);
    };
    document.addEventListener("pointerdown", onPointerDown);
    return () => document.removeEventListener("pointerdown", onPointerDown);
  }, [open]);

  const choose = (id: string) => {
    onChange(id);
    setOpen(false);
  };
  const openList = () => {
    setActive(selectedIndex);
    setOpen(true);
  };

  function onKeyDown(event: React.KeyboardEvent) {
    if (event.key === "Escape" && open) {
      event.preventDefault();
      event.stopPropagation(); // não fecha o diálogo junto
      setOpen(false);
    } else if (event.key === "ArrowDown" || event.key === "ArrowUp") {
      event.preventDefault();
      if (!open) return openList();
      setActive((i) => (event.key === "ArrowDown" ? Math.min(options.length - 1, i + 1) : Math.max(0, i - 1)));
    } else if ((event.key === "Enter" || event.key === " ") && open) {
      event.preventDefault();
      const option = options[active];
      if (option) choose(option.id);
    }
  }

  return (
    <div ref={root} className="relative" onKeyDown={onKeyDown}>
      <button
        id={buttonId}
        type="button"
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-controls={open ? listId : undefined}
        aria-labelledby={`${labelledBy} ${buttonId}`}
        onClick={() => (open ? setOpen(false) : openList())}
        className={cn(
          "flex h-12 w-full cursor-pointer items-center gap-2.5 rounded-field border bg-surface px-3.5 text-left text-base outline-none focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent",
          open ? "border-primary ring-1 ring-primary" : "border-input",
        )}
      >
        <ProDot color={selected?.color ?? null} />
        <span className="min-w-0 flex-1 truncate font-medium">{selected?.name}</span>
        <ChevronDown
          className={cn("size-5 shrink-0 text-ink-muted transition-transform", open && "rotate-180")}
          aria-hidden="true"
        />
      </button>
      {open ? (
        <ul
          id={listId}
          role="listbox"
          aria-labelledby={labelledBy}
          className="absolute inset-x-0 top-full z-20 mt-1.5 flex max-h-64 flex-col overflow-y-auto rounded-field border border-line bg-surface p-1 shadow-float"
        >
          {options.map((option, index) => {
            const on = option.id === value;
            return (
              <li
                key={option.id}
                role="option"
                aria-selected={on}
                onClick={() => choose(option.id)}
                onPointerEnter={() => setActive(index)}
                className={cn(
                  "flex min-h-11 cursor-pointer items-center gap-2.5 rounded-lg px-3 text-base",
                  index === active && "bg-primary-soft/60",
                  on ? "bg-primary-soft font-semibold text-primary" : "font-medium",
                )}
              >
                <ProDot color={option.color} />
                <span className="min-w-0 flex-1 truncate">{option.name}</span>
                {on ? <Check className="size-[18px] shrink-0" aria-hidden="true" /> : null}
              </li>
            );
          })}
        </ul>
      ) : null}
    </div>
  );
}
