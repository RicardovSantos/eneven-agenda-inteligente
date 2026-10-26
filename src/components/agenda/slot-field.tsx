"use client";

import { useState, type CSSProperties } from "react";
import { getPanelDatesAction, getPanelSlotsAction } from "@/app/painel/actions";
import { SlotPicker, type PickedSlot } from "@/components/booking/slot-picker";
import { Input } from "@/components/ui/input";
import { zonedInstant } from "@/server/agenda/time";

export type SlotSelection = {
  /** Instante de início (ISO 8601). */
  startsAt: string;
  /** Veio de "Encaixar fora dos horários" (ignora expediente). */
  outsideHours: boolean;
};

/**
 * Dia e horário do painel: o mesmo seletor de pílulas da página pública, só com
 * horários livres, e a opção "Encaixar fora dos horários" para digitar a hora
 * (conflitos e bloqueios continuam valendo no servidor).
 */
export function SlotField({
  today,
  timezone,
  base,
  loadKey,
  value,
  onChange,
}: {
  today: string;
  timezone: string;
  /** Seleção que define a duração (serviços + profissional) ou o agendamento a remarcar. */
  base: { serviceIds?: string[]; professionalId?: string; bookingId?: string };
  loadKey: string;
  value: SlotSelection | null;
  onChange: (value: SlotSelection | null) => void;
}) {
  const [outside, setOutside] = useState(false);
  const [manualDate, setManualDate] = useState(today);
  const [manualTime, setManualTime] = useState("");

  function setManual(date: string, time: string) {
    setManualDate(date);
    setManualTime(time);
    if (/^\d{4}-\d{2}-\d{2}$/.test(date) && /^\d{2}:\d{2}$/.test(time)) {
      const minutes = Number(time.slice(0, 2)) * 60 + Number(time.slice(3, 5));
      onChange({ startsAt: zonedInstant(date, minutes, timezone).toISOString(), outsideHours: true });
    } else {
      onChange(null);
    }
  }

  const brand = { "--brand": "var(--primary)", "--brand-fg": "var(--primary-foreground)" } as CSSProperties;

  return (
    <div className="flex flex-col gap-4">
      <label className="flex min-h-11 cursor-pointer items-center gap-2.5 text-[0.9375rem]">
        <input
          type="checkbox"
          checked={outside}
          onChange={(event) => {
            setOutside(event.target.checked);
            onChange(null);
            setManualTime("");
          }}
          className="size-5 accent-primary"
        />
        Encaixar fora dos horários
      </label>

      {outside ? (
        <div className="grid grid-cols-2 gap-3">
          <label className="flex flex-col gap-1.5 text-sm font-medium">
            Dia
            <Input type="date" value={manualDate} onChange={(e) => setManual(e.target.value, manualTime)} />
          </label>
          <label className="flex flex-col gap-1.5 text-sm font-medium">
            Hora
            <Input type="time" value={manualTime} onChange={(e) => setManual(manualDate, e.target.value)} />
          </label>
        </div>
      ) : (
        <div style={brand}>
          <SlotPicker
            today={today}
            loadKey={loadKey}
            loadDates={async (from) => {
              const result = await getPanelDatesAction({ ...base, from });
              return result;
            }}
            loadSlots={async (date) => getPanelSlotsAction({ ...base, date })}
            value={value && !value.outsideHours ? { date: "", startsAt: value.startsAt, time: "" } : null}
            onChange={(picked: PickedSlot | null) =>
              onChange(picked ? { startsAt: picked.startsAt, outsideHours: false } : null)
            }
            noDates="Nenhum horário livre nos próximos dias. Use “Encaixar fora dos horários”."
          />
        </div>
      )}
    </div>
  );
}
