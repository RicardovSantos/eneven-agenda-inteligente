"use client";

import { Copy, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import {
  WEEKDAY_LABELS,
  WEEKDAY_ORDER,
  validateWeeklyHours,
  type TimeRange,
  type WeeklyHours,
} from "@/lib/weekly-hours";

const DEFAULT_RANGE: TimeRange = { start: "09:00", end: "18:00" };
const MAX_RANGES = 4;

const toMinutes = (hm: string) => {
  const [h, m] = hm.split(":").map(Number);
  return h * 60 + m;
};
const toHm = (minutes: number) =>
  `${String(Math.floor(minutes / 60)).padStart(2, "0")}:${String(minutes % 60).padStart(2, "0")}`;

/** Próximo intervalo sugerido: 1 h depois do fim do último, com até 3 h. */
function nextRange(ranges: TimeRange[]): TimeRange {
  const last = ranges[ranges.length - 1];
  if (!last) return DEFAULT_RANGE;
  const start = Math.min(toMinutes(last.end) + 60, 22 * 60);
  const end = Math.min(start + 3 * 60, 23 * 60 + 59);
  return { start: toHm(start), end: toHm(end) };
}

type Props = {
  value: WeeklyHours;
  onChange: (next: WeeklyHours) => void;
  /** Texto do interruptor: "Aberto" (estabelecimento) ou "Trabalha" (profissional). */
  toggleLabel?: "Aberto" | "Trabalha";
  /** Prefixo dos ids dos campos (vários editores na mesma tela). */
  idPrefix?: string;
  /** Erro extra por dia (ex.: expediente fora do horário de funcionamento). */
  dayErrors?: Partial<Record<number, string>>;
  disabled?: boolean;
};

/**
 * Editor semanal de horários: um dia por linha, interruptor, vários intervalos
 * por dia e "Copiar segunda para os dias úteis". Controlado (`value`/`onChange`).
 * Reaproveitado em Configurações (funcionamento), Equipe (expediente) e no
 * primeiro acesso.
 */
export function WeeklyHoursEditor({
  value,
  onChange,
  toggleLabel = "Aberto",
  idPrefix = "hours",
  dayErrors,
  disabled,
}: Props) {
  const validation = validateWeeklyHours(value);
  const offLabel = toggleLabel === "Aberto" ? "Fechado" : "Folga";

  const setDay = (day: number, ranges: TimeRange[]) =>
    onChange({ ...value, [day]: ranges } as WeeklyHours);

  const setRange = (day: number, index: number, patch: Partial<TimeRange>) =>
    setDay(
      day,
      value[day as keyof WeeklyHours].map((r, i) => (i === index ? { ...r, ...patch } : r)),
    );

  const copyMonday = () => {
    const monday = value[1];
    onChange({
      ...value,
      2: monday.map((r) => ({ ...r })),
      3: monday.map((r) => ({ ...r })),
      4: monday.map((r) => ({ ...r })),
      5: monday.map((r) => ({ ...r })),
    });
  };

  return (
    <div className="flex flex-col gap-3">
      <ul className="flex flex-col divide-y divide-line rounded-field border border-line">
        {WEEKDAY_ORDER.map((day) => {
          const ranges = value[day];
          const open = ranges.length > 0;
          const error = dayErrors?.[day] ?? validation[day];
          const errorId = `${idPrefix}-${day}-error`;
          return (
            <li
              key={day}
              className="flex flex-col gap-1 px-3 py-2.5 sm:flex-row sm:items-start sm:gap-4"
            >
              <div className="flex items-center gap-1 sm:w-44 sm:shrink-0 sm:pt-0">
                <Switch
                  checked={open}
                  disabled={disabled}
                  onCheckedChange={(on) => setDay(day, on ? [{ ...DEFAULT_RANGE }] : [])}
                  label={`${WEEKDAY_LABELS[day]}: ${toggleLabel}`}
                />
                <div className="min-w-0 leading-tight">
                  <p className="text-sm font-semibold">{WEEKDAY_LABELS[day]}</p>
                  <p className="text-[0.8125rem] text-ink-muted">
                    {open ? toggleLabel : offLabel}
                  </p>
                </div>
              </div>

              {open ? (
                <div className="flex min-w-0 flex-1 flex-col gap-2">
                  {ranges.map((range, index) => (
                    <div key={index} className="flex items-center gap-2">
                      <Input
                        type="time"
                        aria-label={`${WEEKDAY_LABELS[day]}, intervalo ${index + 1}: de`}
                        aria-invalid={error ? true : undefined}
                        aria-describedby={error ? errorId : undefined}
                        value={range.start}
                        disabled={disabled}
                        onChange={(e) => setRange(day, index, { start: e.target.value })}
                        className="h-11 min-w-[6.5rem] flex-1 px-2.5 tabular-nums sm:w-[7.25rem] sm:flex-none sm:px-3"
                      />
                      <span className="text-sm text-ink-muted" aria-hidden="true">
                        às
                      </span>
                      <Input
                        type="time"
                        aria-label={`${WEEKDAY_LABELS[day]}, intervalo ${index + 1}: até`}
                        aria-invalid={error ? true : undefined}
                        aria-describedby={error ? errorId : undefined}
                        value={range.end}
                        disabled={disabled}
                        onChange={(e) => setRange(day, index, { end: e.target.value })}
                        className="h-11 min-w-[6.5rem] flex-1 px-2.5 tabular-nums sm:w-[7.25rem] sm:flex-none sm:px-3"
                      />
                      <button
                        type="button"
                        disabled={disabled}
                        aria-label={`Remover intervalo ${index + 1} de ${WEEKDAY_LABELS[day]}`}
                        onClick={() =>
                          setDay(
                            day,
                            ranges.filter((_, i) => i !== index),
                          )
                        }
                        className="flex size-11 items-center justify-center rounded-field text-ink-muted hover:bg-primary-soft hover:text-foreground disabled:opacity-50"
                      >
                        <X className="size-4" aria-hidden="true" />
                      </button>
                    </div>
                  ))}
                  {ranges.length < MAX_RANGES ? (
                    <button
                      type="button"
                      disabled={disabled}
                      aria-label={`Adicionar intervalo, ${WEEKDAY_LABELS[day]}`}
                      onClick={() => setDay(day, [...ranges, nextRange(ranges)])}
                      className="-ml-2 inline-flex h-9 w-fit items-center rounded-field px-2 text-sm font-semibold text-primary hover:bg-primary-soft disabled:opacity-50"
                    >
                      + intervalo
                    </button>
                  ) : null}
                  {error ? (
                    <p id={errorId} role="alert" className="text-[0.8125rem] leading-snug text-danger">
                      {error}
                    </p>
                  ) : null}
                </div>
              ) : (
                <p className="hidden text-sm text-ink-muted sm:block sm:pt-3">
                  {dayErrors?.[day] ? (
                    <span role="alert" className="text-danger">
                      {dayErrors[day]}
                    </span>
                  ) : null}
                </p>
              )}
            </li>
          );
        })}
      </ul>

      <Button
        type="button"
        variant="outline"
        disabled={disabled}
        onClick={copyMonday}
        className="w-fit"
      >
        <Copy aria-hidden="true" />
        Copiar segunda para os dias úteis
      </Button>
    </div>
  );
}
