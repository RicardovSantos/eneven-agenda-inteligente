"use client";

import { useActionState } from "react";
import { saveWhatsAppSettingsAction, type WhatsAppSettingsState } from "@/app/painel/configuracoes/mensagens/actions";
import { useToastOnResult } from "@/components/ui/toast";
import { SaveRow, SettingsSection } from "./settings-section";

export type WhatsAppOption = { key: string; label: string; checked: boolean; disabled?: boolean };

/** Preferências das mensagens automáticas, com "Salvando…" no botão e aviso de salvo ou de erro. */
export function WhatsAppSettingsForm({ options, twoHours }: { options: WhatsAppOption[]; twoHours: boolean }) {
  const [state, formAction, pending] = useActionState<WhatsAppSettingsState, FormData>(saveWhatsAppSettingsAction, {});
  useToastOnResult(state);
  return (
    <SettingsSection id="notificacoes-automaticas" title="Notificações automáticas" description="Escolha quais mensagens seus clientes recebem sozinhas no WhatsApp.">
      <form action={formAction} className="flex flex-col gap-4">
        <div className="flex flex-col gap-2.5">
          {options.map((option) => (
            <label key={option.key} className="flex min-h-12 cursor-pointer items-center gap-3 rounded-field border border-line bg-canvas px-3.5 has-[:disabled]:cursor-not-allowed has-[:disabled]:opacity-60">
              <input type="checkbox" name={option.key} defaultChecked={option.checked} disabled={option.disabled} className="size-5 shrink-0 accent-primary" />
              <span>{option.label}</span>
            </label>
          ))}
        </div>
        {!twoHours ? <p className="m-0 text-sm text-ink-muted">O lembrete de 2 horas exige plano Profissional ou Studio.</p> : null}
        <SaveRow pending={pending} error={state.error} label="Salvar preferências" />
      </form>
    </SettingsSection>
  );
}
