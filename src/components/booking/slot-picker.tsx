"use client";

import { Loader2 } from "lucide-react";
import { useEffect, useRef, useState, type ReactNode } from "react";
import { dayOfMonth, formatLongDate, formatMonthRange, periodOf, weekdayShort, type DayPeriod } from "@/lib/dates";
import { cn } from "@/lib/utils";

export type PickedSlot = { date: string; startsAt: string; time: string };
type Slot = { startsAt: string; time: string };
type Result<T> = { ok: true; data: T } | { ok: false; error: string };

const PERIODS: DayPeriod[] = ["Manhã", "Tarde", "Noite"];
const LOAD_ERROR = "Não foi possível carregar os horários. Tente novamente.";

/**
 * Carrega algo assíncrono por chave. `loading` é derivado (a chave guardada não
 * é a atual), então não há `setState` síncrono dentro do efeito.
 */
function useLoaded<T>(key: string, load: () => Promise<Result<T>>) {
  const [attempt, setAttempt] = useState(0);
  const [state, setState] = useState<{ key: string; result: Result<T> } | null>(null);
  const loadRef = useRef(load);
  useEffect(() => {
    loadRef.current = load;
  });

  const current = `${key}#${attempt}`;
  useEffect(() => {
    let alive = true;
    loadRef
      .current()
      .catch((): Result<T> => ({ ok: false, error: LOAD_ERROR }))
      .then((result) => {
        if (alive) setState({ key: current, result });
      });
    return () => {
      alive = false;
    };
  }, [current]);

  const ready = state?.key === current ? state.result : null;
  return { result: ready, loading: ready === null, retry: () => setAttempt((n) => n + 1) };
}

/**
 * Seletor de dia e horário (passo 3 da página pública e remarcação): faixa de
 * dias com horário livre e, abaixo, os horários em Manhã / Tarde / Noite.
 * O primeiro dia livre já vem selecionado.
 */
export function SlotPicker({
  today,
  loadKey,
  loadDates,
  loadSlots,
  value,
  onChange,
  noDates,
}: {
  /** Primeiro dia a consultar ("yyyy-MM-dd"). */
  today: string;
  /** Muda quando a seleção de serviços/profissional muda ou os horários precisam recarregar. */
  loadKey: string;
  loadDates: (from: string) => Promise<Result<string[]>>;
  loadSlots: (date: string) => Promise<Result<Slot[]>>;
  value: PickedSlot | null;
  onChange: (value: PickedSlot | null) => void;
  /** Mostrado quando não há nenhum dia livre. */
  noDates: ReactNode;
}) {
  const [picked, setPicked] = useState<string | null>(value?.date ?? null);

  const dates = useLoaded<string[]>(`d|${loadKey}`, () => loadDates(today));
  const dateList = dates.result?.ok ? dates.result.data : [];
  const activeDate =
    picked && dateList.includes(picked) ? picked : (dateList[0] ?? null);

  const slots = useLoaded<Slot[]>(`s|${loadKey}|${activeDate ?? ""}`, async () =>
    activeDate ? loadSlots(activeDate) : { ok: true, data: [] },
  );

  if (dates.loading) {
    return <LoadingBlock label="Carregando datas" />;
  }
  if (!dates.result?.ok) {
    return (
      <RetryBlock message={dates.result?.error ?? LOAD_ERROR} onRetry={dates.retry} />
    );
  }
  if (dateList.length === 0 || !activeDate) {
    return <div className="text-[0.9375rem] leading-snug text-ink-muted">{noDates}</div>;
  }

  const slotList = slots.result?.ok ? slots.result.data : [];

  return (
    <div className="flex flex-col gap-4">
      <p className="m-0 -mb-2 text-sm font-semibold text-ink-muted">
        {formatMonthRange(dateList[0], dateList[dateList.length - 1])}
      </p>
      <div
        role="group"
        aria-label="Dias"
        className="-mx-5 flex gap-2 overflow-x-auto px-5 pb-1 [scrollbar-width:thin]"
      >
        {dateList.map((date) => {
          const selected = date === activeDate;
          return (
            <button
              key={date}
              type="button"
              aria-pressed={selected}
              aria-label={formatLongDate(date)}
              onClick={() => {
                if (date === activeDate) return;
                setPicked(date);
                onChange(null);
              }}
              className={cn(
                "flex h-16 w-14 flex-none cursor-pointer flex-col items-center justify-center gap-0.5 rounded-[14px] font-[inherit]",
                selected
                  ? "border-0 bg-(--brand) text-white"
                  : "border border-line bg-surface text-foreground hover:bg-primary-soft",
              )}
            >
              <span className={cn("text-xs whitespace-nowrap", selected ? "text-white/85" : "text-ink-muted")}>
                {weekdayShort(date)}
              </span>
              <span className="font-display text-lg font-semibold tabular-nums">
                {dayOfMonth(date)}
              </span>
            </button>
          );
        })}
      </div>

      {slots.loading ? (
        <LoadingBlock label="Carregando horários" />
      ) : !slots.result?.ok ? (
        <RetryBlock message={slots.result?.error ?? LOAD_ERROR} onRetry={slots.retry} />
      ) : slotList.length === 0 ? (
        <p className="text-[0.9375rem] text-ink-muted">Sem horários nesse dia. Escolha outro dia.</p>
      ) : (
        PERIODS.map((period) => {
          const inPeriod = slotList.filter((slot) => periodOf(slot.time) === period);
          if (inPeriod.length === 0) return null;
          return (
            <section key={period} className="flex flex-col gap-2.5" aria-label={period}>
              <h3 className="text-sm font-semibold text-ink-muted">{period}</h3>
              <div className="grid grid-cols-4 gap-2">
                {inPeriod.map((slot) => {
                  const selected = value?.startsAt === slot.startsAt;
                  return (
                    <button
                      key={slot.startsAt}
                      type="button"
                      data-starts-at={slot.startsAt}
                      aria-pressed={selected}
                      onClick={() =>
                        onChange({ date: activeDate, startsAt: slot.startsAt, time: slot.time })
                      }
                      className={cn(
                        "min-h-11 cursor-pointer rounded-full text-[15px] font-semibold tabular-nums",
                        selected
                          ? "border-0 bg-(--brand) text-white"
                          : "border border-line bg-surface text-foreground hover:bg-primary-soft",
                      )}
                    >
                      {slot.time}
                    </button>
                  );
                })}
              </div>
            </section>
          );
        })
      )}
    </div>
  );
}

function LoadingBlock({ label }: { label: string }) {
  return (
    <p role="status" className="flex items-center gap-2 py-3 text-[0.9375rem] text-ink-muted">
      <Loader2 className="size-4 animate-spin" aria-hidden="true" />
      {label}…
    </p>
  );
}

function RetryBlock({ message, onRetry }: { message: string; onRetry: () => void }) {
  return (
    <div role="alert" className="flex flex-col items-start gap-2 text-[0.9375rem]">
      <p className="text-foreground">{message}</p>
      <button
        type="button"
        onClick={onRetry}
        className="min-h-11 rounded-xl border border-line px-4 font-semibold hover:bg-primary-soft"
      >
        Tentar de novo
      </button>
    </div>
  );
}
