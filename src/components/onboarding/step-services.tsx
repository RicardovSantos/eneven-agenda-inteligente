"use client";

import { Plus, X } from "lucide-react";
import { useState, useTransition } from "react";
import { archiveServiceAction, saveServiceAction } from "@/app/painel/servicos/actions";
import { TextField } from "@/components/auth/text-field";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Select } from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import { centsFromDigits, formatBRL, formatDuration } from "@/lib/format";
import { StepCard } from "./parts";
import type { WizardProfessional, WizardService } from "./types";

const DURATIONS = [15, 20, 30, 40, 45, 50, 60, 75, 90, 120, 150, 180];

/** Etapa 3: pelo menos um serviço (nome, duração e preço) e a lista dos já adicionados. */
export function StepServices({
  services,
  professionals,
  onServicesChange,
  onBack,
  onNext,
}: {
  services: WizardService[];
  professionals: WizardProfessional[];
  onServicesChange: (next: WizardService[]) => void;
  onBack: () => void;
  onNext: () => void;
}) {
  const [pending, startTransition] = useTransition();
  const [name, setName] = useState("");
  const [durationMin, setDurationMin] = useState(30);
  const [priceCents, setPriceCents] = useState(0);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [error, setError] = useState<string | null>(null);

  /** Grava o serviço do formulário. Devolve `true` se deu certo. */
  const add = async (): Promise<boolean> => {
    setErrors({});
    setError(null);
    const result = await saveServiceAction({
      name,
      description: null,
      durationMin,
      bufferAfterMin: 0,
      priceCents,
      visible: true,
      // Por padrão, todos da equipe fazem todos os serviços.
      professionalIds: professionals.map((p) => p.id),
    });
    if (!result.ok || !result.id) {
      setErrors(result.fieldErrors ?? {});
      setError(result.fieldErrors ? null : (result.error ?? null));
      return false;
    }
    onServicesChange([
      ...services,
      { id: result.id, name: name.trim(), durationMin, priceCents },
    ]);
    setName("");
    setPriceCents(0);
    return true;
  };

  const remove = (service: WizardService) =>
    startTransition(async () => {
      const result = await archiveServiceAction(service.id);
      if (!result.ok) {
        setError(result.error ?? "Não foi possível remover agora.");
        return;
      }
      onServicesChange(services.filter((s) => s.id !== service.id));
    });

  const draft = name.trim() !== "";

  // "Continuar" com o formulário preenchido e sem clicar em "Adicionar": adiciona e segue.
  const next = () =>
    startTransition(async () => {
      if (draft && !(await add())) return;
      onNext();
    });

  return (
    <StepCard
      title="Quais serviços você oferece?"
      description="Adicione pelo menos um. O resto você cadastra depois, em Serviços."
      onBack={onBack}
      onNext={next}
      busy={pending}
      nextDisabled={services.length === 0 && !draft}
      error={error}
    >
      <div className="flex flex-col gap-5">
        {services.length > 0 ? (
          <ul
            aria-label="Serviços adicionados"
            className="flex flex-col divide-y divide-line rounded-field border border-line"
          >
            {services.map((s) => (
              <li key={s.id} className="flex items-center gap-2 py-1 pl-4 pr-1">
                <div className="min-w-0 flex-1 py-1.5 leading-tight">
                  <p className="truncate font-semibold">{s.name}</p>
                  <p className="text-[0.8125rem] tabular-nums text-ink-muted">
                    {formatDuration(s.durationMin)} · {formatBRL(s.priceCents)}
                  </p>
                </div>
                <button
                  type="button"
                  disabled={pending}
                  aria-label={`Remover ${s.name}`}
                  onClick={() => remove(s)}
                  className="flex size-11 shrink-0 items-center justify-center rounded-field text-ink-muted hover:bg-primary-soft hover:text-foreground disabled:opacity-50"
                >
                  <X className="size-4" aria-hidden="true" />
                </button>
              </li>
            ))}
          </ul>
        ) : null}

        <div className="flex flex-col gap-4 rounded-field bg-canvas p-4">
          <p className="text-sm font-semibold">
            {services.length === 0 ? "Seu primeiro serviço" : "Outro serviço"}
          </p>
          <TextField
            name="service-name"
            label="Nome do serviço"
            placeholder="Ex.: Corte feminino"
            className="h-11"
            value={name}
            maxLength={80}
            onChange={(e) => setName(e.target.value)}
            error={errors.name}
          />
          <div className="grid grid-cols-2 gap-3">
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="service-duration">Duração</Label>
              <Select
                id="service-duration"
                value={durationMin}
                onChange={(e) => setDurationMin(Number(e.target.value))}
                aria-invalid={errors.durationMin ? true : undefined}
              >
                {DURATIONS.map((d) => (
                  <option key={d} value={d}>
                    {formatDuration(d)}
                  </option>
                ))}
              </Select>
              {errors.durationMin ? (
                <p role="alert" className="text-[0.8125rem] leading-snug text-danger">
                  {errors.durationMin}
                </p>
              ) : null}
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="service-price">Preço</Label>
              <Input
                id="service-price"
                inputMode="numeric"
                autoComplete="off"
                className="h-11 tabular-nums"
                value={formatBRL(priceCents)}
                onChange={(e) => setPriceCents(centsFromDigits(e.target.value))}
                aria-invalid={errors.priceCents ? true : undefined}
              />
              {errors.priceCents ? (
                <p role="alert" className="text-[0.8125rem] leading-snug text-danger">
                  {errors.priceCents}
                </p>
              ) : null}
            </div>
          </div>
          <Button
            type="button"
            variant="outline"
            disabled={pending || !draft}
            onClick={() => startTransition(async () => void (await add()))}
            className="w-full sm:w-fit"
          >
            <Plus aria-hidden="true" />
            Adicionar serviço
          </Button>
        </div>
      </div>
    </StepCard>
  );
}
