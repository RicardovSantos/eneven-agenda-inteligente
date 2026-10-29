"use client";

import { Copy } from "lucide-react";
import { useEffect, useRef, useState, type KeyboardEvent } from "react";
import { Button } from "@/components/ui/button";
import { useToast } from "@/components/ui/toast";
import { monthName, plural } from "@/lib/dashboard-view";
import { dayOfMonth, formatLongDate } from "@/lib/dates";
import type { Dashboard } from "@/server/dashboard";

/**
 * Passado: sólido. Futuro: listrado com a mesma cor, só mais clara (mistura com o
 * fundo do cartão, então vale nos dois temas) e borda de 1,5px na cor principal.
 */
const HATCH =
  "repeating-linear-gradient(135deg, color-mix(in srgb, var(--primary) 30%, var(--surface)) 0 2px, var(--surface) 2px 5px)";

const PLOT_FILL = 95; // % da altura do gráfico ocupada pela barra mais alta

type Day = Dashboard["perDay"][number];

function tooltipText(day: Day): string {
  return `${formatLongDate(day.date)} · ${day.count === 0 ? "sem agendamentos" : plural(day.count, "agendamento", "agendamentos")}`;
}

function summary(days: Day[], month: string, total: number): string {
  const name = monthName(month);
  const peak = days.reduce((best, d) => (d.count > best.count ? d : best), days[0]);
  return `Gráfico de barras: agendamentos por dia em ${name}. Total de ${plural(total, "agendamento", "agendamentos")}; dia mais movimentado: ${dayOfMonth(peak.date)} de ${name}, com ${peak.count}.`;
}

/** Rótulos do eixo: o computador mostra o dia 1, os múltiplos de 5 e "Hoje"; o celular, só 1, 10, 20 e o último. */
function axisLabel(day: number, today: number | null, last: number): { mobile: string; desktop: string } {
  if (day === today) return { mobile: "Hoje", desktop: "Hoje" };
  const desktop = day === 1 || day % 5 === 0 ? String(day) : "";
  const anchor = day === 1 || day === 10 || day === 20 || day === last;
  const crowded = today !== null && Math.abs(day - today) <= 3;
  return { mobile: anchor && !crowded ? String(day) : "", desktop };
}

export function DayBars({
  days,
  month,
  today,
  publicUrl,
}: {
  days: Day[];
  month: string;
  /** Dia de hoje no fuso do salão ("yyyy-MM-dd"). */
  today: string;
  publicUrl: string | null;
}) {
  const total = days.reduce((sum, d) => sum + d.count, 0);

  return (
    <section
      aria-labelledby="t-dias"
      className="flex flex-col gap-2.5 rounded-[14px] border border-line bg-surface p-3.5 lg:gap-4 lg:rounded-panel lg:px-6 lg:pb-4 lg:pt-5"
    >
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 id="t-dias" className="font-display text-base font-semibold lg:text-xl">
          Agendamentos por dia
        </h2>
        {total > 0 ? (
          <div className="flex gap-4 text-[0.8125rem] text-ink-muted">
            <span className="flex items-center gap-2">
              <span aria-hidden="true" className="size-3 rounded-[3px] bg-primary" />
              Já aconteceram
            </span>
            <span className="flex items-center gap-2">
              <span
                aria-hidden="true"
                className="size-2.5 rounded-[3px] border-[1.5px] border-primary"
                style={{ background: HATCH }}
              />
              Marcados
            </span>
          </div>
        ) : null}
      </div>
      {total > 0 ? (
        <Chart days={days} month={month} today={today} total={total} />
      ) : (
        <EmptyMonth publicUrl={publicUrl} />
      )}
    </section>
  );
}

function EmptyMonth({ publicUrl }: { publicUrl: string | null }) {
  const toast = useToast();
  async function copy() {
    if (!publicUrl) return;
    try {
      await navigator.clipboard.writeText(publicUrl);
      toast.show("Link copiado");
    } catch {
      toast.show("Não foi possível copiar. Selecione e copie o link.", "error");
    }
  }
  return (
    <div className="flex flex-col items-start gap-3 py-2 lg:py-4">
      <p className="text-[0.9375rem] text-ink-muted">Ainda não há agendamentos neste mês.</p>
      {publicUrl ? (
        <Button variant="outline" onClick={copy}>
          <Copy aria-hidden="true" />
          Copiar link
        </Button>
      ) : null}
    </div>
  );
}

function Chart({
  days,
  month,
  today,
  total,
}: {
  days: Day[];
  month: string;
  today: string;
  total: number;
}) {
  const [active, setActive] = useState<number | null>(null);
  const [announcement, setAnnouncement] = useState("");
  const root = useRef<HTMLDivElement>(null);

  const count = days.length;
  const max = Math.max(...days.map((d) => d.count));
  const scale = Math.max(2, Math.ceil(max / 2) * 2);
  const todayIndex = days.findIndex((d) => d.date === today);
  const todayDay = todayIndex === -1 ? null : todayIndex + 1;

  // Toque fora do gráfico fecha o tooltip (no celular não existe "sair com o mouse").
  useEffect(() => {
    if (active === null) return;
    const close = (event: PointerEvent) => {
      if (!root.current?.contains(event.target as Node)) setActive(null);
    };
    document.addEventListener("pointerdown", close);
    return () => document.removeEventListener("pointerdown", close);
  }, [active]);

  function move(index: number) {
    setActive(index);
    setAnnouncement(tooltipText(days[index]));
  }

  function onKeyDown(event: KeyboardEvent<HTMLDivElement>) {
    const at = active ?? (todayIndex === -1 ? 0 : todayIndex);
    const target =
      event.key === "ArrowRight"
        ? Math.min(count - 1, at + 1)
        : event.key === "ArrowLeft"
          ? Math.max(0, at - 1)
          : event.key === "Home"
            ? 0
            : event.key === "End"
              ? count - 1
              : null;
    if (event.key === "Escape") {
      setActive(null);
      return;
    }
    if (target === null) return;
    event.preventDefault();
    move(target);
  }

  const heightOf = (d: Day) => (d.count === 0 ? null : `${(d.count / scale) * PLOT_FILL}%`);
  const activeDay = active === null ? null : days[active];
  const activeHeight = activeDay ? (heightOf(activeDay) ?? "2px") : null;
  const tooltipSide = active === null ? "" : active / count < 0.3 ? "start" : (active + 1) / count > 0.7 ? "end" : "center";

  return (
    <div className="flex flex-col gap-1.5">
      <div
        ref={root}
        role="img"
        aria-label={summary(days, month, total)}
        tabIndex={0}
        onKeyDown={onKeyDown}
        onFocus={(event) => {
          // Só o foco por teclado abre o tooltip (o clique já escolhe o dia).
          if (event.currentTarget.matches(":focus-visible") && active === null) {
            move(todayIndex === -1 ? 0 : todayIndex);
          }
        }}
        onBlur={() => setActive(null)}
        className="flex flex-col gap-1.5 rounded-field outline-none focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-accent"
      >
        <div
          onPointerLeave={(event) => {
            if (event.pointerType === "mouse") setActive(null);
          }}
          className="relative flex h-[84px] items-end gap-0.5 border-b border-line lg:h-[168px]"
        >
          <div aria-hidden="true" className="pointer-events-none absolute inset-x-0 top-0 hidden border-t border-dashed border-line/60 lg:block" />
          <div aria-hidden="true" className="pointer-events-none absolute inset-x-0 top-1/2 hidden border-t border-dashed border-line/60 lg:block" />
          <span
            aria-hidden="true"
            className="absolute -top-0.5 right-0 hidden -translate-y-full text-xs tabular-nums text-ink-muted lg:block"
          >
            {scale}
          </span>

          {days.map((d, i) => {
            const height = heightOf(d);
            const future = !d.past;
            return (
              <div
                key={d.date}
                data-day={d.date}
                onPointerEnter={(event) => {
                  if (event.pointerType === "mouse") setActive(i);
                }}
                onClick={() => setActive(i)}
                className={`flex h-full flex-1 cursor-default items-end justify-center rounded-t-md transition-colors ${
                  active === i ? "bg-primary-soft" : ""
                }`}
              >
                {height === null ? (
                  <div className="h-0.5 w-full rounded-sm bg-line lg:w-[70%] lg:max-w-[22px]" />
                ) : (
                  <div
                    className={`w-full rounded-t-[3px] lg:w-[70%] lg:max-w-[22px] lg:rounded-t-[4px] ${
                      future ? "box-border border-[1.5px] border-b-0 border-primary" : "bg-primary"
                    }`}
                    style={{ height, ...(future ? { background: HATCH } : null) }}
                  />
                )}
              </div>
            );
          })}

          {activeDay && activeHeight ? (
            <div
              aria-hidden="true"
              className="pointer-events-none absolute z-10 whitespace-nowrap rounded-field bg-ink px-3 py-2 text-[0.8125rem] font-medium tabular-nums text-surface shadow-float"
              style={{
                left: `${(((active ?? 0) + 0.5) / count) * 100}%`,
                // Acima da barra, mas nunca acima do topo do gráfico (não cobre título nem legenda).
                bottom: `min(calc(${activeHeight} + 8px), calc(100% - 36px))`,
                transform:
                  tooltipSide === "start"
                    ? "translateX(-12px)"
                    : tooltipSide === "end"
                      ? "translateX(calc(-100% + 12px))"
                      : "translateX(-50%)",
              }}
              data-testid="day-tooltip"
            >
              {tooltipText(activeDay)}
            </div>
          ) : null}
        </div>

        <div aria-hidden="true" className="flex gap-0.5 text-xs tabular-nums">
          {days.map((d, i) => {
            const label = axisLabel(i + 1, todayDay, count);
            const isToday = i + 1 === todayDay;
            return (
              <span
                key={d.date}
                className={`flex-1 whitespace-nowrap text-center ${
                  isToday ? "font-bold text-primary" : "text-ink-muted"
                }`}
              >
                <span className="lg:hidden">{label.mobile}</span>
                <span className="hidden lg:inline">{label.desktop}</span>
              </span>
            );
          })}
        </div>
      </div>

      <p className="sr-only" aria-live="polite">
        {announcement}
      </p>
      <table className="sr-only">
        <caption>Agendamentos por dia</caption>
        <thead>
          <tr>
            <th scope="col">Dia</th>
            <th scope="col">Agendamentos</th>
          </tr>
        </thead>
        <tbody>
          {days.map((d) => (
            <tr key={d.date}>
              <th scope="row">{formatLongDate(d.date)}</th>
              <td>{d.count}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
