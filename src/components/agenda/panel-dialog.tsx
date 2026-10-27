"use client";

import { ArrowLeft, X } from "lucide-react";
import { useEffect, useRef, type ReactNode } from "react";

/**
 * Diálogo do painel: caixa de 560px no computador e tela cheia com "voltar" no
 * celular. O conteúdo só existe enquanto aberto (o estado do formulário zera a
 * cada abertura).
 */
export function PanelDialog({
  open,
  title,
  titleId,
  onClose,
  narrow = false,
  children,
}: {
  open: boolean;
  title: string;
  titleId: string;
  onClose: () => void;
  /** Caixa de 480px em vez de 560px (formulários curtos). */
  narrow?: boolean;
  children: ReactNode;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const dialog = ref.current;
    if (!dialog) return;
    if (open && !dialog.open) dialog.showModal();
    if (!open && dialog.open) dialog.close();
  }, [open]);

  return (
    <dialog
      ref={ref}
      aria-labelledby={titleId}
      onCancel={(event) => {
        event.preventDefault();
        onClose();
      }}
      className={`m-auto max-h-none ${narrow ? "w-[min(calc(100vw-2rem),480px)]" : "w-[min(calc(100vw-2rem),560px)]"} max-w-none overflow-y-auto rounded-panel border border-line bg-surface p-0 text-foreground shadow-float backdrop:bg-ink/40 max-lg:m-0 max-lg:h-dvh max-lg:max-h-none max-lg:w-screen max-lg:rounded-none max-lg:border-0 lg:max-h-[calc(100dvh-3rem)]`}
    >
      {open ? (
        <div className="flex min-h-full flex-col gap-5 px-4 pb-8 pt-3 lg:px-6 lg:py-6">
          <div className="flex items-center gap-1">
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
