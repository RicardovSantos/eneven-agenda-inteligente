"use client";

import { useActionState, useState } from "react";
import {
  saveBookingRulesAction,
  type SettingsFormState,
} from "@/app/painel/configuracoes/actions";
import { Label } from "@/components/ui/label";
import { Select } from "@/components/ui/select";
import { useToastOnResult } from "@/components/ui/toast";
import { SaveRow, SettingsSection } from "./settings-section";

export type RulesInitial = {
  slotIntervalMin: number;
  minNoticeMin: number;
  maxDaysAhead: number;
  cancelWindowMin: number;
};

type Option = { value: number; label: string };

const SLOT: Option[] = [10, 15, 20, 30].map((v) => ({ value: v, label: `${v} min` }));
const NOTICE: Option[] = [
  { value: 30, label: "30 min" },
  { value: 60, label: "1 h" },
  { value: 120, label: "2 h" },
  { value: 240, label: "4 h" },
  { value: 1440, label: "1 dia" },
];
const AHEAD: Option[] = [15, 30, 60, 90].map((v) => ({
  value: v,
  label: `${v} dias à frente`,
}));
const CANCEL: Option[] = [
  { value: 60, label: "1 h antes" },
  { value: 120, label: "2 h antes" },
  { value: 720, label: "12 h antes" },
  { value: 1440, label: "24 h antes" },
];

function RuleSelect({
  name,
  label,
  hint,
  options,
  value,
  onChange,
  error,
}: {
  name: string;
  label: string;
  hint: string;
  options: Option[];
  value: number;
  onChange: (value: number) => void;
  error?: string;
}) {
  return (
    <div className="flex flex-col gap-1.5">
      <Label htmlFor={name}>{label}</Label>
      <Select
        id={name}
        name={name}
        value={value}
        onChange={(e) => onChange(Number(e.target.value))}
        aria-invalid={error ? true : undefined}
        aria-describedby={`${name}-hint`}
      >
        {options.map((o) => (
          <option key={o.value} value={o.value}>
            {o.label}
          </option>
        ))}
      </Select>
      <p
        id={`${name}-hint`}
        className={`text-[0.8125rem] leading-snug ${error ? "text-danger" : "text-ink-muted"}`}
      >
        {error ?? hint}
      </p>
    </div>
  );
}

export function RulesForm({ initial }: { initial: RulesInitial }) {
  const [state, formAction, pending] = useActionState<SettingsFormState, FormData>(
    saveBookingRulesAction,
    {},
  );
  useToastOnResult(state);
  const [rules, setRules] = useState(initial);
  const errors = state.fieldErrors ?? {};
  const set = (key: keyof RulesInitial) => (value: number) =>
    setRules((current) => ({ ...current, [key]: value }));

  return (
    <SettingsSection
      id="rules"
      title="Regras de agendamento"
      description="Valem para quem agenda pelo seu link."
    >
      <form action={formAction} noValidate className="flex flex-col gap-5">
        <div className="grid gap-5 sm:grid-cols-2">
          <RuleSelect
            name="slotIntervalMin"
            label="Intervalo entre horários"
            hint="De quanto em quanto tempo os horários aparecem."
            options={SLOT}
            value={rules.slotIntervalMin}
            onChange={set("slotIntervalMin")}
            error={errors.slotIntervalMin}
          />
          <RuleSelect
            name="minNoticeMin"
            label="Antecedência mínima"
            hint="Quanto antes o cliente precisa agendar."
            options={NOTICE}
            value={rules.minNoticeMin}
            onChange={set("minNoticeMin")}
            error={errors.minNoticeMin}
          />
          <RuleSelect
            name="maxDaysAhead"
            label="Agendar até"
            hint="Até quantos dias no futuro a agenda abre."
            options={AHEAD}
            value={rules.maxDaysAhead}
            onChange={set("maxDaysAhead")}
            error={errors.maxDaysAhead}
          />
          <RuleSelect
            name="cancelWindowMin"
            label="Cliente pode cancelar ou remarcar até"
            hint="Depois disso, só falando com você."
            options={CANCEL}
            value={rules.cancelWindowMin}
            onChange={set("cancelWindowMin")}
            error={errors.cancelWindowMin}
          />
        </div>
        <SaveRow pending={pending} error={state.error} />
      </form>
    </SettingsSection>
  );
}
