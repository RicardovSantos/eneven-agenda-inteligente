"use client";

import { useSyncExternalStore } from "react";
import type { BookingStatus } from "@/server/agenda/bookings";
import { cn } from "@/lib/utils";

export const STATUS_LABEL: Record<BookingStatus, string> = {
  scheduled: "Agendado",
  confirmed: "Confirmado",
  completed: "Atendido",
  no_show: "Faltou",
  canceled: "Cancelado",
};

/** Cartão da lista por status (docs/design/sistema-visual.md): cor + texto, nunca só cor. */
export const STATUS_CARD: Record<BookingStatus, string> = {
  scheduled: "border-[1.5px] border-primary bg-surface",
  confirmed:
    "border border-line bg-surface shadow-[inset_3px_0_0_#0F9D58] dark:shadow-[inset_3px_0_0_#3DD68C]",
  completed: "border border-line bg-surface/85 lg:bg-canvas",
  no_show:
    "border border-line bg-surface shadow-[inset_3px_0_0_#C2410C] dark:shadow-[inset_3px_0_0_#FB923C]",
  canceled: "border border-line bg-surface opacity-60",
};

export const STATUS_BADGE: Record<BookingStatus, string> = {
  scheduled: "bg-primary-soft text-primary",
  confirmed: "bg-[#E8F7EF] text-[#0B7A44] dark:bg-[#12301f] dark:text-[#3dd68c]",
  completed: "bg-line text-ink-muted",
  no_show: "bg-[#FFF4ED] text-[#9A3412] dark:bg-danger-soft dark:text-[#fb923c]",
  canceled: "bg-line text-ink-muted",
};

export function StatusPill({ status, className }: { status: BookingStatus; className?: string }) {
  return (
    <span
      className={cn(
        "inline-flex shrink-0 rounded-full px-2 py-1 text-[11px] font-semibold whitespace-nowrap lg:text-xs",
        STATUS_BADGE[status],
        className,
      )}
    >
      {STATUS_LABEL[status]}
    </span>
  );
}

export function Dot({ color, size = 7 }: { color: string | null; size?: number }) {
  return (
    <span
      aria-hidden="true"
      className="inline-block shrink-0 rounded-full"
      style={{ width: size, height: size, backgroundColor: color ?? "var(--ink-muted)" }}
    />
  );
}

/** Opções de link da agenda (estado na URL: `?data=&pro=&view=`). */
export type AgendaParams = { data?: string; pro?: string; view?: "mes" | "dia" };

export function agendaHref({ data, pro, view }: AgendaParams): string {
  const query = new URLSearchParams();
  if (data) query.set("data", data);
  if (pro && pro !== "todos") query.set("pro", pro);
  if (view && view !== "mes") query.set("view", view);
  const text = query.toString();
  return text ? `/painel?${text}` : "/painel";
}

/**
 * Minuto atual (em ms) que se renova a cada 60 s. No servidor e na hidratação
 * usa o instante renderizado no servidor, sem divergência.
 */
export function useMinuteNow(serverNowMs: number): number {
  return useSyncExternalStore(
    (notify) => {
      const timer = setInterval(notify, 60_000);
      return () => clearInterval(timer);
    },
    () => Math.floor(Date.now() / 60_000) * 60_000,
    () => Math.floor(serverNowMs / 60_000) * 60_000,
  );
}

/** "Terça, 27" (cabeçalho curto da lista no celular). */
export function formatShortWeekdayDay(date: string, longDate: string): string {
  const day = Number(date.slice(8, 10));
  return `${longDate.split(",")[0]}, ${day}`;
}
