"use client";

import { AlarmClock, Bell, CalendarCheck, CalendarClock, CalendarX, type LucideIcon } from "lucide-react";
import { useActionState, useState } from "react";
import { saveWhatsAppSettingsAction, type WhatsAppSettingsState } from "@/app/painel/configuracoes/mensagens/actions";
import { useToastOnResult } from "@/components/ui/toast";
import { cn } from "@/lib/utils";
import { SaveRow, SettingsSection } from "./settings-section";

export type WhatsAppOption = { key: string; label: string; checked: boolean; disabled?: boolean };

const DETAILS: Record<string, { Icon: LucideIcon; text: string }> = {
  bookingCreated: { Icon: CalendarCheck, text: "Confirma com o cliente assim que ele agenda." },
  reminderEve: { Icon: Bell, text: "Lembra o cliente no dia anterior ao horário marcado." },
  reminder2h: { Icon: AlarmClock, text: "Lembra o cliente 2 horas antes. Exige plano Profissional ou Studio." },
  rescheduled: { Icon: CalendarClock, text: "Avisa o cliente quando o horário é remarcado." },
  canceled: { Icon: CalendarX, text: "Avisa o cliente quando o agendamento é cancelado." },
};

/** Cartão com interruptor "Ativado / Desativado". O campo de verdade (checkbox) cobre o cartão inteiro. */
function ToggleCard({ option }: { option: WhatsAppOption }) {
  const [on, setOn] = useState(option.checked);
  const { Icon, text } = DETAILS[option.key] ?? { Icon: Bell, text: "" };
  return (
    <div
      className={cn(
        "relative flex flex-col gap-3 rounded-panel border bg-canvas p-4 text-center transition-colors",
        on && !option.disabled ? "border-primary/50" : "border-line",
        option.disabled && "opacity-60",
      )}
    >
      <input
        type="checkbox"
        role="switch"
        name={option.key}
        aria-label={option.label}
        checked={on}
        disabled={option.disabled}
        onChange={(event) => setOn(event.target.checked)}
        className="peer absolute inset-0 z-10 size-full cursor-pointer appearance-none rounded-panel opacity-0 disabled:cursor-not-allowed"
      />
      <span className="flex items-center justify-center gap-2.5 border-b border-line pb-3" aria-hidden="true">
        <span className={cn("relative h-6 w-11 shrink-0 rounded-full transition-colors", on ? "bg-primary" : "bg-line")}>
          <span className={cn("absolute top-0.5 size-5 rounded-full bg-white shadow transition-all", on ? "left-[1.375rem]" : "left-0.5")} />
        </span>
        <span className={cn("text-sm font-semibold", on ? "text-primary" : "text-ink-muted")}>{on ? "Ativado" : "Desativado"}</span>
      </span>
      <span className="flex items-center justify-center gap-2 text-base font-semibold" aria-hidden="true">
        <Icon className="size-5 shrink-0 text-ink-muted" />
        {option.label}
      </span>
      <span className="text-[0.8125rem] leading-snug text-ink-muted" aria-hidden="true">{text}</span>
      <span className="pointer-events-none absolute inset-0 rounded-panel ring-primary peer-focus-visible:ring-2" aria-hidden="true" />
    </div>
  );
}

/** Preferências das mensagens automáticas, com "Salvando…" no botão e aviso de salvo ou de erro. */
export function WhatsAppSettingsForm({ options, twoHours }: { options: WhatsAppOption[]; twoHours: boolean }) {
  const [state, formAction, pending] = useActionState<WhatsAppSettingsState, FormData>(saveWhatsAppSettingsAction, {});
  useToastOnResult(state);
  return (
    <SettingsSection id="notificacoes-automaticas" title="Notificações automáticas" description="Toque num cartão para ligar ou desligar. As mensagens saem sozinhas pelo WhatsApp.">
      <form action={formAction} className="flex flex-col gap-4">
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          {options.map((option) => <ToggleCard key={option.key} option={option} />)}
        </div>
        {!twoHours ? <p className="m-0 text-sm text-ink-muted">O lembrete de 2 horas exige plano Profissional ou Studio.</p> : null}
        <SaveRow pending={pending} error={state.error} label="Salvar preferências" />
      </form>
    </SettingsSection>
  );
}
