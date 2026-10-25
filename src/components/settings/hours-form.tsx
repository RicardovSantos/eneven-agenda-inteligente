"use client";

import { useActionState, useState } from "react";
import {
  saveHoursAction,
  type SettingsFormState,
} from "@/app/painel/configuracoes/actions";
import { WeeklyHoursEditor } from "@/components/hours/weekly-hours-editor";
import { useToastOnResult } from "@/components/ui/toast";
import {
  WEEKDAYS,
  validateWeeklyHours,
  type WeeklyHours,
} from "@/lib/weekly-hours";
import { SaveRow, SettingsSection } from "./settings-section";

export function HoursForm({ initial }: { initial: WeeklyHours }) {
  const [state, formAction, pending] = useActionState<SettingsFormState, FormData>(
    saveHoursAction,
    {},
  );
  useToastOnResult(state);
  const [hours, setHours] = useState<WeeklyHours>(initial);
  const invalid = Object.keys(validateWeeklyHours(hours)).length > 0;
  const allClosed = WEEKDAYS.every((d) => hours[d].length === 0);

  return (
    <SettingsSection
      id="hours"
      title="Horário de funcionamento"
      description="Os horários da agenda e da equipe nunca saem desta janela."
    >
      <form action={formAction} className="flex flex-col gap-5">
        <input type="hidden" name="hours" value={JSON.stringify(hours)} />
        <WeeklyHoursEditor
          value={hours}
          onChange={setHours}
          toggleLabel="Aberto"
          idPrefix="business"
        />
        {allClosed ? (
          <p className="rounded-field bg-primary-soft px-4 py-3 text-sm leading-snug text-primary">
            Com todos os dias fechados, seus clientes não conseguem agendar.
          </p>
        ) : null}
        <SaveRow
          pending={pending}
          disabled={invalid}
          error={state.error ?? state.fieldErrors?.hours}
        />
      </form>
    </SettingsSection>
  );
}
