"use client";

import { ArrowLeft, Check, Clock, Loader2, MessageCircle, RotateCcw, UserRound } from "lucide-react";
import { useEffect, useRef, useState, type ReactNode } from "react";
import {
  cancelBookingAction,
  completeBookingAction,
  confirmBookingAction,
  issueManageLinkAction,
  noShowBookingAction,
  rescheduleBookingAction,
  undoStatusAction,
  type PanelActionResult,
} from "@/app/painel/actions";
import { ConfirmDialog } from "@/components/catalog/parts";
import { Button } from "@/components/ui/button";
import { useToast } from "@/components/ui/toast";
import { formatShortDate } from "@/lib/dates";
import { formatBRL } from "@/lib/format";
import { formatBrazilPhone } from "@/lib/phone";
import { firstName } from "@/lib/whatsapp";
import { cn } from "@/lib/utils";
import type { DayBooking } from "@/server/agenda/panel-queries";
import { localDateOf } from "@/server/agenda/time";
import { SlotField, type SlotSelection } from "./slot-field";
import { Dot, StatusPill } from "./shared";

const GENERIC = "Não foi possível concluir agora. Tente novamente em instantes.";

const TILE =
  "flex min-h-16 cursor-pointer flex-col items-center justify-center gap-1 rounded-xl border border-line bg-surface text-[13px] font-semibold text-foreground hover:bg-primary-soft disabled:cursor-not-allowed disabled:opacity-50";

/**
 * Detalhe do agendamento (Detalhe.dc.html): folha inferior no celular e painel
 * no lugar da coluna do dia no computador. Ações chamam as server actions;
 * qualquer erro vira toast com a mensagem do servidor.
 */
export function BookingDetail({
  booking,
  today,
  timezone,
  onClose,
}: {
  booking: DayBooking;
  today: string;
  timezone: string;
  onClose: () => void;
}) {
  const toast = useToast();
  const sectionRef = useRef<HTMLElement>(null);
  const [mode, setMode] = useState<"view" | "reschedule">("view");
  const [slot, setSlot] = useState<SlotSelection | null>(null);
  const [pending, setPending] = useState<string | null>(null);
  const [confirmCancel, setConfirmCancel] = useState(false);

  useEffect(() => {
    sectionRef.current?.focus();
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape" && !document.querySelector("dialog[open]")) onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  const { status } = booking;
  const active = status === "scheduled" || status === "confirmed";
  const date = localDateOf(new Date(booking.startsAt), timezone);
  const phone = booking.customer.phone;

  async function act(
    key: string,
    run: () => Promise<PanelActionResult>,
    actionLabel = "Avisar pelo WhatsApp",
  ): Promise<boolean> {
    if (pending) return false;
    setPending(key);
    try {
      const result = await run();
      if (result.ok) {
        toast.show(
          result.message,
          "success",
          result.whatsappUrl ? { label: actionLabel, href: result.whatsappUrl } : undefined,
        );
        return true;
      }
      toast.show(result.error, "error");
    } catch {
      toast.show(GENERIC, "error");
    } finally {
      setPending(null);
    }
    return false;
  }

  return (
    <>
      {/* Fundo escuro só no celular (folha) */}
      <div
        aria-hidden="true"
        onClick={onClose}
        className="fixed inset-0 z-40 bg-[rgb(21_19_31/0.45)] lg:hidden"
      />
      <section
        ref={sectionRef}
        tabIndex={-1}
        role="dialog"
        aria-modal="true"
        aria-labelledby="titulo-detalhe"
        data-testid="booking-detail"
        className="fixed inset-x-0 bottom-0 z-50 flex max-h-[92dvh] flex-col gap-[18px] overflow-y-auto rounded-t-[22px] bg-surface px-5 pb-6 pt-2.5 text-foreground shadow-[0_-12px_32px_-12px_rgb(41_48_60/0.35)] outline-none lg:static lg:z-auto lg:max-h-none lg:overflow-visible lg:rounded-none lg:bg-transparent lg:p-0 lg:shadow-none"
      >
        <span aria-hidden="true" className="h-1 w-10 self-center rounded-full bg-line lg:hidden" />
        <button
          type="button"
          onClick={onClose}
          className="-ml-2 hidden min-h-11 cursor-pointer items-center gap-1.5 self-start rounded-field px-2 text-sm font-semibold text-ink-muted hover:bg-primary-soft hover:text-foreground lg:flex"
        >
          <ArrowLeft className="size-[18px]" aria-hidden="true" />
          Voltar ao dia
        </button>

        <div className="flex items-start justify-between gap-3">
          <div className="flex min-w-0 flex-col gap-1.5">
            <StatusPill status={status} className="self-start px-2.5 text-xs" />
            <h2 id="titulo-detalhe" className="font-display text-[22px] font-semibold">
              {booking.customer.name}
            </h2>
            <span className="text-sm tabular-nums text-ink-muted">
              {formatBrazilPhone(phone)} · {booking.customer.visits}ª visita
            </span>
          </div>
          <div className="flex shrink-0 items-start gap-2">
            <a
              href={`https://wa.me/${phone}`}
              target="_blank"
              rel="noopener noreferrer"
              aria-label={`Conversar com ${firstName(booking.customer.name)} no WhatsApp`}
              className="flex min-h-11 items-center gap-1.5 rounded-xl border border-[#CDEBDB] bg-[#E8F7EF] px-3.5 text-sm font-semibold text-[#0B7A44] no-underline hover:bg-[#dcf2e7] dark:border-[#1f4a31] dark:bg-[#12301f] dark:text-[#3dd68c]"
            >
              <MessageCircle className="size-[18px]" aria-hidden="true" />
              WhatsApp
            </a>
          </div>
        </div>

        <dl className="m-0 grid grid-cols-[96px_minmax(0,1fr)] gap-x-2.5 gap-y-3 rounded-2xl bg-canvas p-4 text-[15px]">
          <Row label="Serviço">{booking.services.map((s) => s.name).join(" + ")}</Row>
          <Row label="Quando" tabular>
            {formatShortDate(date)} · {booking.time} às {booking.endTime}
          </Row>
          <Row label="Profissional">
            <span className="flex items-center gap-2">
              <Dot color={booking.professional.color} size={8} />
              {booking.professional.name}
            </span>
          </Row>
          <Row label="Valor" tabular>
            {formatBRL(booking.totalCents)}
          </Row>
          {booking.notes ? <Row label="Observação">{booking.notes}</Row> : null}
        </dl>

        {mode === "reschedule" ? (
          <div className="flex flex-col gap-4">
            <h3 className="text-sm font-semibold">Novo dia e horário</h3>
            <SlotField
              today={today}
              timezone={timezone}
              base={{ bookingId: booking.id }}
              loadKey={`${booking.id}|${booking.startsAt}`}
              value={slot}
              onChange={setSlot}
            />
            <div className="flex gap-3">
              <Button
                type="button"
                variant="outline"
                size="lg"
                onClick={() => {
                  setMode("view");
                  setSlot(null);
                }}
                className="flex-1"
              >
                Voltar
              </Button>
              <Button
                type="button"
                size="lg"
                disabled={!slot || pending !== null}
                onClick={async () => {
                  if (!slot) return;
                  const ok = await act("reschedule", () => rescheduleBookingAction(booking.id, slot.startsAt));
                  if (ok) {
                    setMode("view");
                    setSlot(null);
                  }
                }}
                className="flex-1"
              >
                {pending === "reschedule" ? <Loader2 className="size-4 animate-spin" aria-hidden="true" /> : null}
                Remarcar
              </Button>
            </div>
          </div>
        ) : (
          <div className="flex flex-col gap-2.5">
            {status === "scheduled" ? (
              <Button
                type="button"
                size="lg"
                disabled={pending !== null}
                onClick={() => act("confirm", () => confirmBookingAction(booking.id))}
                className="min-h-12 gap-2 rounded-xl text-base"
              >
                {pending === "confirm" ? (
                  <Loader2 className="size-[18px] animate-spin" aria-hidden="true" />
                ) : (
                  <Check className="size-[18px]" aria-hidden="true" />
                )}
                Confirmar presença
              </Button>
            ) : null}

            {status === "confirmed" || status === "completed" || status === "no_show" ? (
              <Button
                type="button"
                variant="outline"
                size="lg"
                disabled={pending !== null}
                onClick={() => act("undo", () => undoStatusAction(booking.id))}
                className="min-h-12 rounded-xl"
              >
                {pending === "undo" ? <Loader2 className="size-4 animate-spin" aria-hidden="true" /> : null}
                {status === "confirmed" ? "Desfazer confirmação" : "Voltar para agendado"}
              </Button>
            ) : null}

            {active ? (
              <div className="grid grid-cols-3 gap-2">
                <button type="button" className={TILE} disabled={pending !== null} onClick={() => setMode("reschedule")}>
                  <RotateCcw className="size-5" aria-hidden="true" />
                  Remarcar
                </button>
                <button
                  type="button"
                  className={TILE}
                  disabled={pending !== null}
                  onClick={() => act("complete", () => completeBookingAction(booking.id))}
                >
                  <UserRound className="size-5" aria-hidden="true" />
                  Atendido
                </button>
                <button
                  type="button"
                  className={TILE}
                  disabled={pending !== null}
                  onClick={() => act("noshow", () => noShowBookingAction(booking.id))}
                >
                  <Clock className="size-5" aria-hidden="true" />
                  Faltou
                </button>
              </div>
            ) : null}

            {active ? (
              <Button
                type="button"
                variant="outline"
                size="lg"
                disabled={pending !== null}
                onClick={() => act("reminder", () => issueManageLinkAction(booking.id), "Abrir WhatsApp")}
                className="min-h-11 gap-2 rounded-xl"
              >
                {pending === "reminder" ? (
                  <Loader2 className="size-4 animate-spin" aria-hidden="true" />
                ) : (
                  <MessageCircle className="size-4" aria-hidden="true" />
                )}
                Lembrar pelo WhatsApp
              </Button>
            ) : null}

            {active ? (
              <button
                type="button"
                disabled={pending !== null}
                onClick={() => setConfirmCancel(true)}
                className="min-h-11 cursor-pointer border-0 bg-transparent text-[15px] font-semibold text-[#C2410C] hover:underline disabled:opacity-50 dark:text-[#fb923c]"
              >
                Cancelar agendamento
              </button>
            ) : null}

            {status === "canceled" ? (
              <p className="text-sm text-ink-muted">Este agendamento foi cancelado.</p>
            ) : null}
          </div>
        )}
      </section>

      <ConfirmDialog
        open={confirmCancel}
        title="Cancelar este agendamento?"
        confirmLabel="Cancelar agendamento"
        pending={pending === "cancel"}
        onCancel={() => setConfirmCancel(false)}
        onConfirm={async () => {
          await act("cancel", () => cancelBookingAction(booking.id));
          setConfirmCancel(false);
        }}
      >
        O horário de {booking.customer.name} ({formatShortDate(date)}, {booking.time}) volta a ficar livre. Depois de
        cancelar, você pode avisar a pessoa pelo WhatsApp.
      </ConfirmDialog>
    </>
  );
}

function Row({ label, children, tabular }: { label: string; children: ReactNode; tabular?: boolean }) {
  return (
    <>
      <dt className="text-ink-muted">{label}</dt>
      <dd className={cn("m-0 font-semibold", tabular && "tabular-nums")}>{children}</dd>
    </>
  );
}
