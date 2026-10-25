"use client";

import { Plus, X } from "lucide-react";
import { useState, useTransition } from "react";
import {
  deactivateProfessionalAction,
  saveProfessionalAction,
} from "@/app/painel/equipe/actions";
import { TextField } from "@/components/auth/text-field";
import { ColorDot } from "@/components/catalog/parts";
import { Button } from "@/components/ui/button";
import { nextProfessionalColor } from "@/lib/professional-colors";
import type { WeeklyHours } from "@/lib/weekly-hours";
import { StepCard } from "./parts";
import type { WizardProfessional, WizardService } from "./types";

/** Etapa 4: o dono já está na equipe; dá para adicionar mais pessoas pelo nome. */
export function StepTeam({
  professionals,
  services,
  hours,
  onProfessionalsChange,
  onBack,
  onNext,
}: {
  professionals: WizardProfessional[];
  services: WizardService[];
  /** Horário de funcionamento: o expediente das novas pessoas começa igual a ele. */
  hours: WeeklyHours;
  onProfessionalsChange: (next: WizardProfessional[]) => void;
  onBack: () => void;
  onNext: () => void;
}) {
  const [pending, startTransition] = useTransition();
  const [name, setName] = useState("");
  const [nameError, setNameError] = useState<string | undefined>();
  const [error, setError] = useState<string | null>(null);

  const add = async (): Promise<boolean> => {
    setNameError(undefined);
    setError(null);
    const color = nextProfessionalColor(professionals.map((p) => p.color));
    const result = await saveProfessionalAction({
      name,
      color,
      active: true,
      // Por padrão, todos fazem todos os serviços.
      serviceIds: services.map((s) => s.id),
      hours,
    });
    if (!result.ok || !result.id) {
      setNameError(result.fieldErrors?.name);
      const other = result.fieldErrors
        ? Object.entries(result.fieldErrors).find(([k]) => k !== "name")?.[1]
        : result.error;
      setError(other ?? null);
      return false;
    }
    onProfessionalsChange([...professionals, { id: result.id, name: name.trim(), color }]);
    setName("");
    return true;
  };

  const remove = (person: WizardProfessional) =>
    startTransition(async () => {
      const result = await deactivateProfessionalAction(person.id);
      if (!result.ok) {
        setError(result.error ?? "Não foi possível remover agora.");
        return;
      }
      onProfessionalsChange(professionals.filter((p) => p.id !== person.id));
    });

  const draft = name.trim() !== "";

  // "Concluir" com um nome digitado e sem clicar em "Adicionar": adiciona e segue.
  const finish = () =>
    startTransition(async () => {
      if (draft && !(await add())) return;
      onNext();
    });

  return (
    <StepCard
      title="Quem atende?"
      description="Você já está na equipe. Se tiver mais gente, adicione agora; todos fazem todos os serviços por enquanto."
      onBack={onBack}
      onNext={finish}
      nextLabel="Concluir"
      busy={pending}
      error={error}
    >
      <div className="flex flex-col gap-5">
        <ul
          aria-label="Equipe"
          className="flex flex-col divide-y divide-line rounded-field border border-line"
        >
          {professionals.map((p, index) => (
            <li key={p.id} className="flex items-center gap-3 py-1 pl-4 pr-1">
              <ColorDot color={p.color} size={12} />
              <p className="min-w-0 flex-1 truncate py-3 font-semibold">
                {p.name}
                {index === 0 ? (
                  <span className="ml-2 rounded-full bg-primary-soft px-2 py-0.5 text-xs font-semibold text-primary">
                    Você
                  </span>
                ) : null}
              </p>
              {index === 0 ? (
                <span className="size-11 shrink-0" aria-hidden="true" />
              ) : (
                <button
                  type="button"
                  disabled={pending}
                  aria-label={`Remover ${p.name}`}
                  onClick={() => remove(p)}
                  className="flex size-11 shrink-0 items-center justify-center rounded-field text-ink-muted hover:bg-primary-soft hover:text-foreground disabled:opacity-50"
                >
                  <X className="size-4" aria-hidden="true" />
                </button>
              )}
            </li>
          ))}
        </ul>

        <div className="flex flex-col gap-4 rounded-field bg-canvas p-4">
          <TextField
            name="professional-name"
            label="Adicionar outra pessoa"
            placeholder="Nome (ex.: Bia)"
            className="h-11"
            value={name}
            maxLength={60}
            onChange={(e) => setName(e.target.value)}
            error={nameError}
          />
          <Button
            type="button"
            variant="outline"
            disabled={pending || !draft}
            onClick={() => startTransition(async () => void (await add()))}
            className="w-full sm:w-fit"
          >
            <Plus aria-hidden="true" />
            Adicionar à equipe
          </Button>
        </div>
      </div>
    </StepCard>
  );
}
