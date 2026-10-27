import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

/**
 * Lista + ficha lado a lado a partir de 1024px (a ficha numa coluna de 420px
 * à direita, como em Serviços); abaixo disso, uma tela de cada vez: a lista em
 * `/painel/clientes` e a ficha em `/painel/clientes/{id}`.
 */
export function ClientsLayout({
  list,
  aside,
  hasSelection,
}: {
  list: ReactNode;
  aside: ReactNode;
  hasSelection: boolean;
}) {
  return (
    // Sangra por cima do padding do painel para a ficha encostar nas bordas.
    <div className="lg:-mx-8 lg:-mb-10 lg:-mt-8 lg:flex lg:min-h-dvh">
      <div
        className={cn(
          "flex w-full min-w-0 flex-col gap-4 lg:flex-1 lg:gap-[18px] lg:px-8 lg:pb-10 lg:pt-7",
          hasSelection && "max-lg:hidden",
        )}
      >
        {list}
      </div>
      <aside
        aria-labelledby="titulo-cliente"
        className={cn(
          "lg:sticky lg:top-0 lg:h-dvh lg:w-[420px] lg:shrink-0 lg:overflow-y-auto lg:border-l lg:border-line lg:bg-surface lg:p-6",
          !hasSelection && "max-lg:hidden",
        )}
      >
        {aside}
      </aside>
    </div>
  );
}

/** Ficha vazia (só no computador, quando nenhum cliente está aberto). */
export function EmptyProfile() {
  return (
    <div className="flex h-full min-h-48 flex-col items-center justify-center gap-2 text-center">
      <h2 id="titulo-cliente" className="max-w-[16rem] text-[0.9375rem] font-medium leading-snug text-ink-muted">
        Escolha um cliente para ver a ficha.
      </h2>
    </div>
  );
}
