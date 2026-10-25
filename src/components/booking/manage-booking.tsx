"use client";

import { CalendarPlus, ChevronLeft, Loader2 } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import {
  cancelAction,
  getRescheduleDatesAction,
  getRescheduleSlotsAction,
  rescheduleAction,
} from "@/app/agendamento/[token]/actions";
import { FormAlert, FormNotice } from "@/components/auth/form-alert";
import { ConfirmDialog } from "@/components/catalog/parts";
import { formatLongDate } from "@/lib/dates";
import type { BookingView } from "@/server/public/view";
import { BookingDetails } from "./booking-details";
import {
  brandButton,
  CompactBrand,
  outlineButton,
  textLink,
  whatsappUrl,
  type BookingTenant,
} from "./shell";
import { SlotPicker, type PickedSlot } from "./slot-picker";

const STATUS_LABEL: Record<string, string> = {
  scheduled: "Agendado",
  confirmed: "Confirmado",
};

/**
 * Página `/agendamento/{token}`: resumo e status, "Adicionar ao calendário",
 * remarcar (mesmo seletor de dia e horário do passo 3) e cancelar com diálogo
 * de confirmação. Fora do prazo do salão, só orienta a falar com ele.
 */
export function ManageBooking({
  token,
  tenant,
  booking,
  canChange,
  today,
}: {
  token: string;
  tenant: BookingTenant;
  booking: BookingView;
  canChange: boolean;
  today: string;
}) {
  const router = useRouter();
  const [mode, setMode] = useState<"view" | "reschedule">("view");
  const [notice, setNotice] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [slot, setSlot] = useState<PickedSlot | null>(null);
  const [pending, setPending] = useState<"reschedule" | "cancel" | null>(null);
  const [confirmCancel, setConfirmCancel] = useState(false);

  const active = booking.status === "scheduled" || booking.status === "confirmed";
  const canceled = booking.status === "canceled";

  async function reschedule() {
    if (!slot || pending) return;
    setPending("reschedule");
    setError(null);
    try {
      const result = await rescheduleAction(token, { startsAt: slot.startsAt });
      if (result.ok) {
        setNotice("Agendamento remarcado");
        setMode("view");
        setSlot(null);
        router.refresh();
      } else {
        setError(result.error);
      }
    } catch {
      setError("Não foi possível remarcar agora. Confira sua conexão e tente de novo.");
    } finally {
      setPending(null);
    }
  }

  async function cancel() {
    if (pending) return;
    setPending("cancel");
    setError(null);
    try {
      const result = await cancelAction(token);
      setConfirmCancel(false);
      if (result.ok) {
        setNotice("Agendamento cancelado");
        router.refresh();
      } else {
        setError(result.error);
      }
    } catch {
      setConfirmCancel(false);
      setError("Não foi possível cancelar agora. Confira sua conexão e tente de novo.");
    } finally {
      setPending(null);
    }
  }

  if (mode === "reschedule") {
    return (
      <>
        <header className="flex items-center gap-2.5 border-b border-line px-5 py-4">
          <button
            type="button"
            aria-label="Voltar"
            onClick={() => {
              setMode("view");
              setError(null);
            }}
            className="-ml-2.5 grid size-11 shrink-0 place-items-center rounded-xl text-foreground hover:bg-primary-soft"
          >
            <ChevronLeft className="size-[22px]" aria-hidden="true" />
          </button>
          <CompactBrand tenant={tenant} />
        </header>
        <main className="flex flex-1 flex-col gap-4 px-5 pt-[18px]">
          <div className="flex flex-col gap-1">
            <h1 className="m-0 font-display text-[19px] font-semibold">Escolha o novo dia e horário</h1>
            <span className="text-[13px] text-ink-muted">
              {booking.services.map((s) => s.name).join(" + ")} · com {booking.professionalName}
            </span>
          </div>
          {error ? <FormAlert>{error}</FormAlert> : null}
          <SlotPicker
            today={today}
            loadKey={`reschedule|${booking.startsAt}`}
            loadDates={async (from) => {
              const r = await getRescheduleDatesAction(token, from);
              return r.ok ? { ok: true, data: r.dates } : r;
            }}
            loadSlots={async (date) => {
              const r = await getRescheduleSlotsAction(token, date);
              return r.ok ? { ok: true, data: r.slots } : r;
            }}
            value={slot}
            onChange={(next) => {
              setSlot(next);
              if (next) setError(null);
            }}
            noDates={
              <>
                Sem horários livres nos próximos dias. Fale com {tenant.name} para remarcar.
              </>
            }
          />
        </main>
        <div className="sticky bottom-0 flex flex-col gap-2.5 border-t border-line bg-surface px-5 pt-3.5 pb-[max(20px,env(safe-area-inset-bottom))]">
          <div className="flex items-center justify-between gap-3 text-sm">
            {slot ? (
              <>
                <span className="text-ink-muted">{formatLongDate(slot.date)}</span>
                <span className="font-bold tabular-nums">{slot.time}</span>
              </>
            ) : (
              <span className="text-ink-muted">Escolha um horário</span>
            )}
          </div>
          <button
            type="button"
            onClick={reschedule}
            disabled={!slot || pending !== null}
            className={brandButton}
          >
            {pending === "reschedule" ? (
              <>
                <Loader2 className="size-4 animate-spin" aria-hidden="true" />
                Remarcando…
              </>
            ) : (
              "Remarcar"
            )}
          </button>
        </div>
      </>
    );
  }

  return (
    <div className="flex min-h-dvh flex-col gap-6 px-5 pt-7 pb-5">
      <CompactBrand tenant={tenant} />

      <div className="flex flex-col gap-3">
        {notice ? <FormNotice>{notice}</FormNotice> : null}
        {error ? <FormAlert>{error}</FormAlert> : null}
        <div className="flex flex-col gap-2">
          <h1 className="m-0 font-display text-[26px] font-semibold">
            {canceled ? "Este agendamento foi cancelado." : "Seu agendamento"}
          </h1>
          {active ? (
            <p className="m-0 text-[15px] text-ink-muted">
              <span className="font-semibold text-foreground">{STATUS_LABEL[booking.status]}</span>
            </p>
          ) : !canceled ? (
            <p className="m-0 text-[15px] text-ink-muted">Este agendamento já foi encerrado.</p>
          ) : null}
        </div>
      </div>

      <div className={canceled ? "opacity-60" : undefined}>
        <BookingDetails booking={booking} tenant={tenant} />
      </div>

      {active && !canChange ? (
        <p className="m-0 text-[15px] leading-snug text-ink-muted">
          Para remarcar ou cancelar, fale com {tenant.name}.
        </p>
      ) : null}

      <div className="mt-auto flex flex-col gap-2.5">
        {active ? (
          <a href={`/api/agendamento/${token}/ics`} download className={brandButton}>
            <CalendarPlus className="size-[18px]" aria-hidden="true" />
            Adicionar ao calendário
          </a>
        ) : (
          <Link href={`/${tenant.slug}`} className={brandButton}>
            Agendar de novo
          </Link>
        )}
        {active && canChange ? (
          <>
            <button
              type="button"
              onClick={() => {
                setNotice(null);
                setError(null);
                setMode("reschedule");
              }}
              className={outlineButton}
            >
              Remarcar
            </button>
            <button
              type="button"
              onClick={() => {
                setNotice(null);
                setConfirmCancel(true);
              }}
              className="flex min-h-11 items-center justify-center self-center px-2 text-[0.9375rem] font-semibold text-danger underline-offset-4 hover:underline"
            >
              Cancelar agendamento
            </button>
          </>
        ) : null}
        {tenant.whatsapp && (!active || !canChange) ? (
          <a
            href={whatsappUrl(tenant.whatsapp)}
            target="_blank"
            rel="noopener noreferrer"
            className={active ? outlineButton : textLink}
          >
            Falar com {tenant.name} no WhatsApp
          </a>
        ) : null}
      </div>

      <ConfirmDialog
        open={confirmCancel}
        title="Cancelar este agendamento?"
        confirmLabel={pending === "cancel" ? "Cancelando…" : "Cancelar agendamento"}
        pending={pending === "cancel"}
        onConfirm={cancel}
        onCancel={() => setConfirmCancel(false)}
      >
        O horário será liberado para outras pessoas. Se mudar de ideia, é só agendar de novo.
      </ConfirmDialog>
    </div>
  );
}
