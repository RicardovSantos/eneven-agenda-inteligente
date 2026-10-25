import { Check } from "lucide-react";
import { cn } from "@/lib/utils";

/**
 * Momento de conclusão do sistema visual: o fio se completa e vira o check no
 * degradê (mockup `PublicaConfirmado`). A animação roda uma única vez (~600 ms:
 * fio 400 ms, check logo depois) e é a única animação automática do produto.
 * Com `prefers-reduced-motion` o resultado já aparece pronto (ver
 * `globals.css`). Decorativo: o título da tela diz o que aconteceu.
 */
export function CompletionCheck({ className }: { className?: string }) {
  return (
    <div aria-hidden="true" className={cn("flex w-[220px] items-center", className)}>
      <span className="size-2.5 shrink-0 rounded-full bg-[#3E07D2] dark:bg-[#A673FF]" />
      <span className="completion-thread h-[3px] flex-1 bg-[linear-gradient(90deg,#3E07D2,#9429F7,#F581FB)]" />
      <span className="completion-check flex size-14 shrink-0 items-center justify-center rounded-full bg-[linear-gradient(135deg,#9429F7,#F581FB)] text-white shadow-[0_10px_24px_-10px_rgb(148_41_247/0.7)]">
        <Check className="size-7" strokeWidth={2.6} />
      </span>
    </div>
  );
}
