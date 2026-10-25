"use client";

import { Check, Copy } from "lucide-react";
import { useState } from "react";
import { useToast } from "@/components/ui/toast";

/** Copia o link público para a área de transferência (com confirmação em toast). */
export function CopyLinkButton({ url }: { url: string }) {
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
