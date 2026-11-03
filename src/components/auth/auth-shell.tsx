import type { ReactNode } from "react";
import { AgendaPreview } from "@/components/brand/agenda-preview";
import { BrandLogo } from "@/components/brand/logo";

/**
 * Casca das telas de entrada. Em telas largas: duas colunas, formulário à
 * esquerda e painel colorido com a prévia da agenda à direita. No celular:
 * uma coluna só.
 */
export function AuthShell({
  tagline,
  children,
}: {
  /** Frase curta abaixo da prévia (só aparece em telas largas). */
  tagline: string;
  children: ReactNode;
}) {
  return (
    // No celular a tela ocupa exatamente a área visível (`fixed inset-0`) e a página
    // não rola solta: só rola por dentro se o conteúdo não couber (teclado aberto, tela baixa).
    <div className="fixed inset-0 overflow-y-auto overscroll-y-none bg-canvas lg:static lg:grid lg:min-h-dvh lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)] lg:overflow-visible">
      <main className="flex min-h-full flex-col px-6 pb-10 pt-6 lg:min-h-dvh lg:px-12 lg:py-12">
        <div className="mx-auto flex w-full max-w-[480px] flex-1 flex-col lg:mx-0 lg:max-w-[420px]">
          <header>
            <BrandLogo width={140} priority className="lg:hidden" />
            <BrandLogo width={168} priority className="hidden lg:inline-block" />
          </header>
          <div className="flex flex-1 flex-col justify-center py-8">
            {children}
          </div>
        </div>
      </main>

      <aside
        className="hidden flex-col items-center justify-center gap-10 overflow-hidden p-12 text-white lg:flex"
        style={{ backgroundColor: "var(--auth-panel)" }}
      >
        <AgendaPreview />
        <p className="max-w-[32ch] text-center text-lg font-medium text-white/90">
          {tagline}
        </p>
      </aside>
    </div>
  );
}
