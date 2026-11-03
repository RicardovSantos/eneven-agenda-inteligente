"use client";

import { ArrowLeft, X } from "lucide-react";
import { useEffect, useRef, type ReactNode } from "react";
import { PersonAvatar } from "@/components/media/person-avatar";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

/** Bolinha da cor do profissional (só identificação; o nome sempre vai junto). */
export function ColorDot({ color, size = 8 }: { color: string | null; size?: number }) {
  return (
    <span
      aria-hidden="true"
      className="inline-block shrink-0 rounded-full"
      style={{ width: size, height: size, backgroundColor: color ?? "var(--ink-muted)" }}
    />
  );
}

/** Etiqueta com bolinha: "Bia", "Léo". */
export function ProChip({ name, color, photoUrl }: { name: string; color: string | null; photoUrl?: string | null }) {
  return (
    <span className="inline-flex items-center gap-1.5 rounded-full bg-canvas py-1 pr-2.5 pl-1.5 text-[0.8125rem] font-medium">
      <PersonAvatar name={name} color={color} photoUrl={photoUrl} size={22} />
      {name}
    </span>
  );
}

export function StatusBadge({
  tone,
  children,
}: {
  tone: "on" | "off";
  children: ReactNode;
}) {
  return (
    <span
      className={cn(
        "inline-flex rounded-full px-2.5 py-1 text-xs font-semibold whitespace-nowrap",
        tone === "on"
          ? "bg-[#E8F7EF] text-[#0B7A44] dark:bg-[#12301f] dark:text-[#3dd68c]"
          : "bg-line text-ink-muted",
      )}
    >
      {children}
    </span>
  );
}

export function FieldError({ id, children }: { id?: string; children?: string }) {
  if (!children) return null;
  return (
    <p id={id} role="alert" className="text-[0.8125rem] leading-snug text-danger">
      {children}
    </p>
  );
}

/** Seção de página com a coluna de edição à direita (≥ 1024px) ou em tela cheia. */
export function CatalogLayout({
  list,
  panel,
}: {
  list: ReactNode;
  panel: ReactNode;
}) {
  return (
    // Sangra por cima do padding do painel para a coluna de edição encostar nas bordas.
    <div className="lg:-mx-8 lg:-mb-10 lg:-mt-8 lg:flex lg:min-h-dvh">
      <div className="mx-auto flex w-full min-w-0 max-w-[1100px] flex-col gap-5 lg:mx-0 lg:max-w-none lg:flex-1 lg:px-8 lg:pb-10 lg:pt-8">
        {list}
      </div>
      {panel}
    </div>
  );
}

/**
 * Coluna de edição: à direita no computador (borda esquerda, branca, fixa na
 * altura da janela) e página inteira com "voltar" no celular.
 */
export function EditPanel({
  title,
  titleId,
  onClose,
  widthClass = "lg:w-[420px]",
  stickyClass = "lg:top-0 lg:h-dvh",
  children,
}: {
  title: string;
  titleId: string;
  onClose: () => void;
  widthClass?: string;
  /** Posição colada da coluna (padrão: toda a altura da janela; a plataforma desconta o topo fixo). */
  stickyClass?: string;
  children: ReactNode;
}) {
  const ref = useRef<HTMLElement>(null);
  useEffect(() => {
    ref.current?.scrollTo({ top: 0 });
  }, [title]);

  return (
    <aside
      ref={ref}
      aria-labelledby={titleId}
      className={cn(
        "fixed inset-0 z-40 overflow-y-auto bg-surface lg:sticky lg:z-auto lg:shrink-0 lg:border-l lg:border-line",
        stickyClass,
        widthClass,
      )}
    >
      <div className="flex min-h-full flex-col gap-4 px-4 pb-10 pt-3 lg:gap-[18px] lg:px-6 lg:py-7">
        <div className="flex items-center gap-1 lg:justify-between">
          <button
            type="button"
            onClick={onClose}
            aria-label="Voltar"
            className="-ml-2 flex size-11 items-center justify-center rounded-field text-ink hover:bg-primary-soft lg:hidden"
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
            className="hidden size-10 items-center justify-center rounded-field text-ink-muted hover:bg-primary-soft hover:text-foreground lg:flex"
          >
            <X className="size-5" aria-hidden="true" />
          </button>
        </div>
        {children}
      </div>
    </aside>
  );
}

/** Diálogo de confirmação: título com a pergunta, consequência, "Voltar" + ação em #C2410C. */
export function ConfirmDialog({
  open,
  title,
  confirmLabel,
  pending,
  titleId = "confirm-title",
  onConfirm,
  onCancel,
  children,
}: {
  open: boolean;
  /** Diferente quando há mais de um diálogo de confirmação na mesma página. */
  titleId?: string;
  title: string;
  confirmLabel: string;
  pending?: boolean;
  onConfirm: () => void;
  onCancel: () => void;
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
      onCancel={(e) => {
        e.preventDefault();
        onCancel();
      }}
      className="m-auto w-[min(calc(100vw-2rem),26rem)] rounded-panel border border-line bg-surface p-6 text-foreground shadow-float backdrop:bg-ink/40"
    >
      <div className="flex flex-col gap-3">
        <h2 id={titleId} className="font-display text-xl font-semibold">
          {title}
        </h2>
        <div className="text-[0.9375rem] leading-snug text-ink-muted">{children}</div>
        <div className="mt-3 flex gap-3">
          <Button type="button" variant="outline" onClick={onCancel} autoFocus className="flex-1">
            Voltar
          </Button>
          <Button
            type="button"
            onClick={onConfirm}
            disabled={pending}
            className="flex-1 bg-[#C2410C] text-white hover:bg-[#9A3412] dark:bg-[#fb923c] dark:text-[#15131f] dark:hover:bg-[#fdba74]"
          >
            {confirmLabel}
          </Button>
        </div>
      </div>
    </dialog>
  );
}

/** Estado vazio que convida a agir. */
export function EmptyState({
  title,
  text,
  action,
}: {
  title: string;
  text: string;
  action?: ReactNode;
}) {
  return (
    <div className="flex flex-col items-center gap-3 rounded-panel border border-line bg-surface px-6 py-12 text-center">
      <h2 className="font-display text-xl font-semibold">{title}</h2>
      <p className="max-w-sm text-[0.9375rem] leading-snug text-ink-muted">{text}</p>
      {action}
    </div>
  );
}
