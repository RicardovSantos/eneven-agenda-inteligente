"use client";

import { Check, Copy, Loader2 } from "lucide-react";
import { useState, type ReactNode } from "react";
import { FormAlert } from "@/components/auth/form-alert";
import { Button } from "@/components/ui/button";
import { useToast } from "@/components/ui/toast";

/** Cartão de uma etapa: título, apoio, conteúdo e a barra "Voltar / Continuar". */
export function StepCard({
  title,
  description,
  children,
  error,
  onBack,
  onNext,
  nextLabel = "Continuar",
  nextDisabled,
  busy,
}: {
  title: string;
  description: string;
  children: ReactNode;
  error?: string | null;
  onBack?: () => void;
  onNext: () => void;
  nextLabel?: string;
  nextDisabled?: boolean;
  busy?: boolean;
}) {
  return (
    <section
      aria-labelledby="step-title"
      className="flex flex-col gap-6 rounded-panel border border-line bg-surface p-5 sm:p-6"
    >
      <header className="flex flex-col gap-1">
        <h1
          id="step-title"
          tabIndex={-1}
          className="text-[1.375rem] font-semibold outline-none sm:text-2xl"
        >
          {title}
        </h1>
        <p className="text-sm leading-snug text-ink-muted">{description}</p>
      </header>

      {children}

      {error ? <FormAlert>{error}</FormAlert> : null}

      <div className="flex flex-col-reverse gap-2 sm:flex-row sm:items-center sm:justify-between">
        {onBack ? (
          <Button type="button" variant="ghost" disabled={busy} onClick={onBack} className="sm:px-5">
            Voltar
          </Button>
        ) : (
          <span />
        )}
        <Button
          type="button"
          disabled={busy || nextDisabled}
          onClick={onNext}
          className="w-full px-6 sm:w-auto"
        >
          {busy ? (
            <>
              <Loader2 className="animate-spin" aria-hidden="true" />
              Salvando…
            </>
          ) : (
            nextLabel
          )}
        </Button>
      </div>
    </section>
  );
}

/** Botão que copia um texto e confirma com um toast. */
export function CopyButton({
  text,
  label,
  toastMessage,
  variant = "outline",
}: {
  text: string;
  label: string;
  toastMessage: string;
  variant?: "outline" | "default";
}) {
  const toast = useToast();
  const [copied, setCopied] = useState(false);

  async function copy() {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      toast.show(toastMessage);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      toast.show("Não foi possível copiar. Selecione o texto e copie.", "error");
    }
  }

  return (
    <Button type="button" variant={variant} onClick={copy} className="w-full sm:w-auto">
      {copied ? <Check aria-hidden="true" /> : <Copy aria-hidden="true" />}
      {label}
    </Button>
  );
}
