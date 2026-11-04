"use client";

import { Trash2 } from "lucide-react";
import { Fragment } from "react";
import { cn } from "@/lib/utils";
import type { DayAgenda, DayBlock, DayBooking } from "@/server/agenda/panel-queries";
import { NowLine } from "./now-line";
import { PersonLabel } from "@/components/media/person-avatar";
import { STATUS_CARD, StatusPill } from "./shared";

/**
 * Lista do dia (coluna da direita no computador, corpo da tela no celular):
 * hora em Outfit, cliente, serviço · profissional, selo de status e, no dia de
 * hoje, a linha do "agora" entre os horários.
 */
export function DayList({
  day,
  isToday,
  nowMs,
  onOpen,
  canDeleteBlock,
  onDeleteBlock,
  photos,
}: {
  photos: Record<string, string | null>;
  day: DayAgenda;
  isToday: boolean;
  nowMs: number;
  onOpen: (id: string) => void;
  canDeleteBlock: (professionalId: string | null) => boolean;
  onDeleteBlock: (id: string) => void;
}) {
  // A linha entra antes do primeiro item que começa depois de agora (ou no fim).
  const nextIndex = day.items.findIndex((item) => new Date(item.startsAt).getTime() > nowMs);
  const lineIndex = isToday ? (nextIndex === -1 ? day.items.length : nextIndex) : -1;

  return (
    <ol className="m-0 flex list-none flex-col gap-2 p-0">
      {day.items.map((item, index) => (
        <Fragment key={`${item.kind}-${item.id}`}>
          {index === lineIndex ? <NowLine nowMs={nowMs} timezone={day.timezone} /> : null}
          <li>
            {item.kind === "booking" ? (
              <BookingRow booking={item} onOpen={onOpen} photoUrl={photos[item.professional.id] ?? null} />
            ) : (
              <BlockRow block={item} onDelete={canDeleteBlock(item.professionalId) ? onDeleteBlock : null} />
            )}
          </li>
        </Fragment>
      ))}
      {lineIndex === day.items.length ? <NowLine nowMs={nowMs} timezone={day.timezone} /> : null}
    </ol>
  );
}

export function BookingRow({ booking, onOpen, photoUrl }: { booking: DayBooking; onOpen: (id: string) => void; photoUrl: string | null }) {
  const canceled = booking.status === "canceled";
  return (
    <button
      type="button"
      onClick={() => onOpen(booking.id)}
      aria-label={`${booking.time}, ${booking.customer.name}, ${booking.services.map((s) => s.name).join(" e ")}, ${booking.professional.name}`}
      data-booking-id={booking.id}
      className={cn(
        "flex min-h-16 w-full cursor-pointer items-center gap-2.5 rounded-[14px] px-3 py-2.5 text-left text-foreground lg:items-start lg:gap-3 lg:rounded-xl lg:px-3.5 lg:py-3",
        STATUS_CARD[booking.status],
      )}
    >
      <span className="w-[46px] flex-none font-display text-base font-semibold tabular-nums lg:w-12 lg:pt-px">
        {booking.time}
      </span>
      <span className="flex min-w-0 flex-1 flex-col gap-[3px]">
        <span
          className={cn(
            "truncate text-[15px] font-semibold",
            booking.status === "completed" && "text-ink-muted",
            canceled && "line-through",
          )}
        >
          {booking.customer.name}
        </span>
        <span className="truncate text-[13px] text-ink-muted">
          {booking.services.map((s) => s.name).join(" + ")}
        </span>
        <PersonLabel
          name={booking.professional.name}
          color={booking.professional.color}
          photoUrl={photoUrl}
          size={22}
          className="mt-0.5 text-[13px] text-ink-muted"
        />
      </span>
      <StatusPill status={booking.status} />
    </button>
  );
}

export function BlockRow({ block, onDelete }: { block: DayBlock; onDelete: ((id: string) => void) | null }) {
  const who = block.professionalName ?? "Todo o estabelecimento";
  return (
    <div
      data-block-id={block.id}
      className="flex min-h-16 items-center gap-2.5 rounded-[14px] border border-line bg-[repeating-linear-gradient(135deg,var(--line)_0,var(--line)_1.5px,transparent_1.5px,transparent_8px)] px-3 py-2.5 text-ink-muted lg:gap-3 lg:rounded-xl lg:px-3.5"
    >
      <span className="w-[46px] flex-none font-display text-base font-semibold tabular-nums text-ink-muted lg:w-12">
        {block.time}
      </span>
      <span className="flex min-w-0 flex-1 flex-col gap-[3px]">
        <span className="truncate text-[15px] font-semibold text-foreground">
          Bloqueado{block.reason ? ` · ${block.reason}` : ""}
        </span>
        <span className="truncate text-[13px]">
          {block.time} às {block.endTime} · {who}
        </span>
      </span>
      {onDelete ? (
      <button
        type="button"
        onClick={() => onDelete(block.id)}
        aria-label={`Remover bloqueio${block.reason ? ` ${block.reason}` : ""}`}
        className="flex size-11 shrink-0 cursor-pointer items-center justify-center rounded-field text-ink-muted hover:bg-surface hover:text-foreground"
      >
        <Trash2 className="size-5" aria-hidden="true" />
      </button>
      ) : null}
    </div>
  );
}
