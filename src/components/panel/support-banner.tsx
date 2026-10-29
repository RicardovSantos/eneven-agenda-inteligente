"use client";

import { Loader2 } from "lucide-react";
import { useTransition } from "react";
import { leaveSupportAction } from "@/app/admin/actions";
import { useToast } from "@/components/ui/toast";

/**
 * Faixa do modo suporte (super-admin "entrou como"): fixa no topo de todo o
 * painel, `--ink` com texto claro e "Voltar à plataforma" contornado. O
 * atributo `data-support-banner` faz o CSS global descontar a faixa do que
 * gruda no topo da janela (`globals.css`).
 */
export function SupportBanner({ tenantName }: { tenantName: string }) {
  const { show } = useToast();
  const [pending, startTransition] = useTransition();

  return (
    <div
      data-support-banner=""
      role="region"
      aria-label="Modo suporte"
      className="sticky top-0 z-40 flex h-14 items-center justify-between gap-3 bg-ink px-4 text-[0.8125rem] leading-tight text-canvas lg:h-12 lg:px-8 lg:text-sm"
    >
      <p className="line-clamp-2 min-w-0" title={`Você está vendo como ${tenantName} (suporte).`}>
        Você está vendo como <strong className="font-semibold">{tenantName}</strong> (suporte).
      </p>
      <button
        type="button"
        disabled={pending}
        onClick={() =>
          startTransition(async () => {
            const result = await leaveSupportAction();
            if (result && !result.ok) show(result.error, "error");
          })
        }
        className="flex min-h-9 shrink-0 cursor-pointer items-center gap-2 rounded-field border border-canvas/70 px-3 text-[0.8125rem] font-semibold text-canvas outline-none hover:bg-canvas/15 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-canvas disabled:opacity-60 lg:text-sm"
      >
        {pending ? <Loader2 className="size-4 animate-spin" aria-hidden="true" /> : null}
        Voltar à plataforma
      </button>
    </div>
  );
}
