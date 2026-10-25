"use client";

import { useState, useTransition } from "react";
import { saveHoursAction } from "@/app/painel/configuracoes/actions";
import { WeeklyHoursEditor } from "@/components/hours/weekly-hours-editor";
import { WEEKDAYS, validateWeeklyHours, type WeeklyHours } from "@/lib/weekly-hours";
import { StepCard } from "./parts";

/** Etapa 2: horário de funcionamento (já vem preenchido com o padrão do cadastro). */
export function StepHours({
  initial,
  onBack,
  onSave,
}: {
  initial: WeeklyHours;
  onBack: () => void;
  /** Depois de gravar o horário; devolve um erro (texto) se a equipe não pôde acompanhar. */
  onSave: (hours: WeeklyHours) => Promise<string | null>;
}) {
  const [hours, setHours] = useState<WeeklyHours>(initial);
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  const invalid = Object.keys(validateWeeklyHours(hours)).length > 0;
  const allClosed = WEEKDAYS.every((d) => hours[d].length === 0);

  const save = () => {
    setError(null);
    startTransition(async () => {
      const form = new FormData();
      form.set("hours", JSON.stringify(hours));
      const result = await saveHoursAction({}, form);
      if (result.error || result.fieldErrors) {
        setError(result.error ?? result.fieldErrors?.hours ?? "Horário inválido.");
        return;
      }
      const teamError = await onSave(hours);
      if (teamError) setError(teamError);
    });
  };

  return (
    <StepCard
      title="Quando você atende?"
      description="Seus clientes só veem horários dentro deste período. Dá para mudar depois."
      onBack={onBack}
      onNext={save}
      busy={pending}
      nextDisabled={invalid}
      error={error}
    >
      <div className="flex flex-col gap-4">
        <WeeklyHoursEditor value={hours} onChange={setHours} toggleLabel="Aberto" idPrefix="onboarding" />
        {allClosed ? (
          <p className="rounded-field bg-primary-soft px-4 py-3 text-sm leading-snug text-primary">
            Com todos os dias fechados, seus clientes não conseguem agendar.
          </p>
        ) : null}
      </div>
    </StepCard>
  );
}
