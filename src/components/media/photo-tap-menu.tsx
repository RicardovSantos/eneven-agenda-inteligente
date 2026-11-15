"use client";

import { Camera, ImagePlus, Trash2 } from "lucide-react";
import { useEffect, useId, useRef, useState, type ReactNode } from "react";
import { cn } from "@/lib/utils";

/**
 * Faz a própria imagem ser o botão (como nos apps de mensagens): sem foto, o
 * toque abre a escolha do arquivo; com foto, abre um menu "Trocar" / "Remover".
 * `children` é o quadro da imagem; a camada clicável fica por cima dele.
 */
export function PhotoTapMenu({
  label,
  hasImage,
  disabled,
  round,
  className,
  onPick,
  onRemove,
  children,
}: {
  /** Nome da imagem, para leitores de tela ("Logo", "Imagem 1"…). */
  label: string;
  hasImage: boolean;
  disabled?: boolean;
  round?: boolean;
  className?: string;
  onPick: () => void;
  /** Sem isto o menu não oferece "Remover" (o toque sempre abre o arquivo). */
  onRemove?: (() => void) | undefined;
  children: ReactNode;
}) {
  const [open, setOpen] = useState(false);
  const menuId = useId();
  const root = useRef<HTMLDivElement>(null);
  const hasMenu = hasImage && Boolean(onRemove);
  const shown = open && hasMenu && !disabled;

  useEffect(() => {
    if (!open) return;
    const onPointerDown = (event: PointerEvent) => {
      if (!root.current?.contains(event.target as Node)) setOpen(false);
    };
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") setOpen(false);
    };
    document.addEventListener("pointerdown", onPointerDown);
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("pointerdown", onPointerDown);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [open]);

  const choose = (action: () => void) => () => {
    setOpen(false);
    action();
  };

  const item =
    "flex min-h-11 w-full items-center gap-2.5 rounded-lg px-3 text-left text-base font-medium hover:bg-primary-soft focus-visible:bg-primary-soft focus-visible:outline-none";

  return (
    <div ref={root} className={cn("relative", className)}>
      {children}
      <button
        type="button"
        disabled={disabled}
        aria-label={hasImage ? `${label}: trocar ou remover` : `${label}: enviar`}
        aria-haspopup={hasMenu ? "menu" : undefined}
        aria-expanded={hasMenu ? shown : undefined}
        aria-controls={shown ? menuId : undefined}
        onClick={() => (hasMenu ? setOpen((v) => !v) : onPick())}
        className={cn(
          "absolute inset-0 cursor-pointer outline-none focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent disabled:cursor-default",
          round ? "rounded-full" : "rounded-field",
        )}
      >
        <span
          aria-hidden="true"
          className={cn(
            "absolute grid place-items-center rounded-full border-2 border-surface bg-primary text-primary-foreground shadow-sm",
            round ? "-bottom-0.5 -right-0.5 size-8" : "bottom-2 right-2 size-9",
          )}
        >
          <Camera className="size-4" />
        </span>
      </button>
      {shown ? (
        <div
          id={menuId}
          role="menu"
          aria-label={label}
          className="absolute left-0 top-full z-30 mt-2 w-52 rounded-field border border-line bg-surface p-1 shadow-lg"
        >
          <button type="button" role="menuitem" autoFocus className={item} onClick={choose(onPick)}>
            <ImagePlus className="size-4 text-ink-muted" aria-hidden="true" />
            Trocar foto
          </button>
          <button
            type="button"
            role="menuitem"
            className={cn(item, "text-danger")}
            onClick={choose(() => onRemove?.())}
          >
            <Trash2 className="size-4" aria-hidden="true" />
            Remover foto
          </button>
        </div>
      ) : null}
    </div>
  );
}
