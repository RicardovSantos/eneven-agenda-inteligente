"use client";

import { Monitor, Moon, Sun } from "lucide-react";
import { useState, useSyncExternalStore, type ComponentType } from "react";
import { cn } from "@/lib/utils";
import {
  applyThemePreference,
  readThemePreference,
  type ThemePreference,
} from "@/lib/theme";
import { SettingsSection } from "./settings-section";

const OPTIONS: Array<{ value: ThemePreference; label: string; hint: string; Icon: ComponentType<{ className?: string }> }> = [
  { value: "auto", label: "Automático", hint: "Segue o tema do aparelho", Icon: Monitor },
  { value: "light", label: "Claro", hint: "Fundo claro sempre", Icon: Sun },
  { value: "dark", label: "Escuro", hint: "Fundo escuro sempre", Icon: Moon },
];

const subscribeNothing = () => () => {};

/** Configuração geral: escolha do tema (automático, claro ou escuro), salva neste aparelho. */
export function ThemeForm() {
  // No servidor e na hidratação vale "auto"; depois lê o que está salvo no aparelho.
  const stored = useSyncExternalStore(subscribeNothing, readThemePreference, () => "auto" as ThemePreference);
  const [chosen, setChosen] = useState<ThemePreference | null>(null);
  const current = chosen ?? stored;

  function choose(value: ThemePreference) {
    setChosen(value);
    applyThemePreference(value);
  }

  return (
    <SettingsSection
      id="geral"
      title="Configuração geral"
      description="Escolha o tema do painel. A escolha fica salva neste aparelho."
    >
      <div role="radiogroup" aria-label="Tema" className="grid gap-2.5 sm:grid-cols-3">
        {OPTIONS.map(({ value, label, hint, Icon }) => {
          const active = current === value;
          return (
            <button
              key={value}
              type="button"
              role="radio"
              aria-checked={active}
              onClick={() => choose(value)}
              className={cn(
                "flex min-h-16 items-center gap-3 rounded-field border px-4 py-3 text-left transition-colors",
                active ? "border-primary bg-primary-soft" : "border-line bg-canvas hover:bg-primary-soft/60",
              )}
            >
              <Icon className={cn("size-5 shrink-0", active ? "text-primary" : "text-ink-muted")} aria-hidden="true" />
              <span className="flex min-w-0 flex-col">
                <span className="font-semibold">{label}</span>
                <span className="text-[0.8125rem] text-ink-muted">{hint}</span>
              </span>
            </button>
          );
        })}
      </div>
    </SettingsSection>
  );
}
