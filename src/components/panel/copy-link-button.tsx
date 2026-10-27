"use client";

import { Check, Copy } from "lucide-react";
import { useState } from "react";
import { useToast } from "@/components/ui/toast";

/** Copia o link público para a área de transferência (com confirmação em toast). */
function useCopy(url: string) {
  const toast = useToast();
  const [copied, setCopied] = useState(false);

  async function copy() {
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
      toast.show("Link copiado");
      setTimeout(() => setCopied(false), 2000);
    } catch {
      toast.show("Não foi possível copiar. Selecione e copie o link.", "error");
    }
  }

  return { copied, copy };
}

export function CopyLinkButton({ url }: { url: string }) {
  const { copied, copy } = useCopy(url);
  return (
    <button
      type="button"
      onClick={copy}
      aria-label="Copiar link de agendamento"
      className="flex size-11 shrink-0 items-center justify-center rounded-field border border-line bg-surface text-primary hover:bg-primary-soft"
    >
      {copied ? (
        <Check className="size-5" aria-hidden="true" />
      ) : (
        <Copy className="size-5" aria-hidden="true" />
      )}
    </button>
  );
}

/**
 * Bloco "Seu link de agendamento" da barra lateral (mockup Main): o link
 * como botão que copia. Sem link liberado, explica como liberar.
 */
export function SidebarLink({ label, url }: { label: string; url: string | null }) {
  return (
    <div className="flex flex-col gap-2">
      <p className="text-[0.8125rem] text-ink-muted">Seu link de agendamento</p>
      {url ? <SidebarLinkButton label={label} url={url} /> : (
        <p className="text-[0.8125rem] leading-snug text-ink-muted">
          Confirme seu e-mail para liberar seu link
        </p>
      )}
    </div>
  );
}

function SidebarLinkButton({ label, url }: { label: string; url: string }) {
  const { copied, copy } = useCopy(url);
  return (
    <button
      type="button"
      onClick={copy}
      aria-label={`Copiar link de agendamento: ${label}`}
      className="flex min-h-11 w-full cursor-pointer items-center gap-2 rounded-field border border-line bg-canvas px-3 text-left text-[0.8125rem] font-medium text-foreground hover:bg-primary-soft"
    >
      {copied ? (
        <Check className="size-4 shrink-0 text-primary" aria-hidden="true" />
      ) : (
        <Copy className="size-4 shrink-0" aria-hidden="true" />
      )}
      <span className="min-w-0 break-all py-2 leading-snug">{label}</span>
    </button>
  );
}
