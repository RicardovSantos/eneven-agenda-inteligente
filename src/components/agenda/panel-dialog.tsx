"use client";

import { ArrowLeft, X } from "lucide-react";
import { useEffect, useRef, type ReactNode } from "react";

/**
 * Diálogo do painel: caixa de 560px no computador e tela cheia com "voltar" no
 * celular. O conteúdo só existe enquanto aberto (o estado do formulário zera a
 * cada abertura).
 *
 * `layout="fixed"`: cabeçalho fixo no topo e o filho ocupa o resto da altura
 * (ele mesmo rola no meio e prende o rodapé embaixo, ex.: Voltar / Agendar).
 */
export function PanelDialog({
  open,
  title,
  titleId,
  onClose,
  narrow = false,
  wide = false,
  layout = "scroll",
  children,
}: {
  open: boolean;
  title: string;
  titleId: string;
  onClose: () => void;
  /** Caixa de 480px em vez de 560px (formulários curtos). */
  narrow?: boolean;
  /** Caixa de 680px (formulários longos). */
  wide?: boolean;
  layout?: "scroll" | "fixed";
  children: ReactNode;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const dialog = ref.current;
    if (!dialog) return;
    if (open && !dialog.open) dialog.showModal();
    if (!open && dialog.open) dialog.close();
  }, [open]);

  const fixed = layout === "fixed";
  const width = wide ? "w-[min(calc(100vw-2rem),680px)]" : narrow ? "w-[min(calc(100vw-2rem),480px)]" : "w-[min(calc(100vw-2rem),560px)]";
  return (
    <dialog
      ref={ref}
      aria-labelledby={titleId}
      onCancel={(event) => {
        event.preventDefault();
        onClose();
      }}
      className={`m-auto max-h-none ${width} max-w-none ${fixed ? "overflow-hidden open:flex open:flex-col lg:h-[min(52.5rem,calc(100dvh-3rem))]" : "overflow-y-auto"} rounded-panel border border-line bg-surface p-0 text-foreground shadow-float backdrop:bg-ink/40 max-lg:m-0 max-lg:h-dvh max-lg:max-h-none max-lg:w-screen max-lg:rounded-none max-lg:border-0 lg:max-h-[calc(100dvh-3rem)]`}
    >
      {open ? (
        <div
          className={
            fixed
              ? "flex min-h-0 flex-1 flex-col"
              : "flex min-h-full flex-col gap-5 px-4 pb-8 pt-3 lg:px-6 lg:py-6"
          }
        >
          <div
            className={
              fixed
                ? "flex shrink-0 items-center gap-1 border-b border-line px-4 pb-3 pt-3 lg:px-6 lg:py-4"
                : "flex items-center gap-1"
            }
          >
            <button
              type="button"
              onClick={onClose}
              aria-label="Voltar"
              className="-ml-2 flex size-11 cursor-pointer items-center justify-center rounded-field text-ink hover:bg-primary-soft lg:hidden"
            >
              <ArrowLeft className="size-5" aria-hidden="true" />
            </button>
            <h2 id={titleId} className="flex-1 font-display text-xl font-semibold lg:text-[1.375rem]">
              {title}
            </h2>
            <button
              type="button"
              onClick={onClose}
              aria-label="Fechar"
              className="hidden size-10 cursor-pointer items-center justify-center rounded-field text-ink-muted hover:bg-primary-soft hover:text-foreground lg:flex"
            >
              <X className="size-5" aria-hidden="true" />
            </button>
          </div>
          {children}
        </div>
      ) : null}
    </dialog>
  );
}
