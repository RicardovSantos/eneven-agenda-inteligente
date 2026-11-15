"use client";

import { Users } from "lucide-react";
import Link from "next/link";
import { useEffect, useRef } from "react";
import { PersonAvatar } from "@/components/media/person-avatar";
import { cn } from "@/lib/utils";
import { agendaHref } from "./shared";

type Pro = { id: string; name: string; color: string | null; photoUrl?: string | null };

const SIZE = 52;

/**
 * Filtro de profissional para o celular: uma linha de fotos redondas que rola para o
 * lado (estilo "stories"). O escolhido ganha um anel; tocar nele de novo volta para "Todos".
 */
export function ProStories({
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
    const target = item.offsetLeft - (box.clientWidth - item.offsetWidth) / 2;
    box.scrollTo({ left: Math.max(0, target) });
  }, [selectedId]);

  return (
    <div
      ref={scroller}
      role="group"
      aria-label="Profissional"
      className="-mx-4 flex gap-3 overflow-x-auto px-4 pb-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden lg:hidden"
    >
      <Item
        label="Todos"
        active={selectedId === null}
        href={agendaHref({ data: date, pro: "todos", view })}
      >
        <span
          aria-hidden="true"
          className="grid place-items-center rounded-full bg-primary-soft text-primary"
          style={{ width: SIZE, height: SIZE }}
        >
          <Users className="size-6" />
        </span>
      </Item>
      {professionals.map((p) => {
        const active = selectedId === p.id;
        return (
          <Item
            key={p.id}
            label={p.name}
            shortLabel={p.name.trim().split(/\s+/)[0] ?? p.name}
            active={active}
            // Tocar de novo no escolhido volta para "Todos".
            href={agendaHref({ data: date, pro: active ? "todos" : p.id, view })}
          >
            <PersonAvatar name={p.name} color={p.color} photoUrl={p.photoUrl} size={SIZE} />
          </Item>
        );
      })}
    </div>
  );
}

function Item({
  label,
  shortLabel,
  active,
  href,
  children,
}: {
  label: string;
  shortLabel?: string;
  active: boolean;
  href: string;
  children: React.ReactNode;
}) {
  return (
    <Link
      href={href}
      scroll={false}
      aria-current={active ? "true" : undefined}
      aria-label={label}
      className="flex w-[4.5rem] shrink-0 flex-col items-center gap-1.5 rounded-field py-1 outline-none focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
    >
      <span
        className={cn(
          "rounded-full p-[3px] ring-[2.5px] transition-shadow",
          active ? "ring-primary" : "ring-transparent",
        )}
      >
        {children}
      </span>
      <span
        aria-hidden="true"
        className={cn(
          "w-full truncate text-center text-[0.8125rem] leading-tight",
          active ? "font-semibold text-primary" : "font-medium text-foreground",
        )}
      >
        {shortLabel ?? label}
      </span>
    </Link>
  );
}
