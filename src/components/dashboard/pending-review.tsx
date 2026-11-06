"use client";

import { ChevronRight, CircleAlert, Loader2, X } from "lucide-react";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";
import { completeBookingAction, noShowBookingAction } from "@/app/painel/actions";
import { Button } from "@/components/ui/button";
import { SHEET_HANDLE_CLASS, useSheetDrag } from "@/components/ui/use-sheet-drag";
import { useToast } from "@/components/ui/toast";
import { plural } from "@/lib/dashboard-view";

export type PendingItem = {
  id: string;
  /** "Segunda, 26/10 · 14:30" (já no fuso do salão). */
  when: string;
  customer: string;
  services: string;
};

const ICON =
  "flex shrink-0 items-center justify-center rounded-full bg-[#FFF1E8] text-[#C2410C] dark:bg-danger-soft dark:text-danger";

/**
 * Aviso de atendimentos sem resultado + "Revisar agora": diálogo no computador,
 * folha inferior no celular, com "Atendido" e "Faltou" por linha.
 */
export function PendingReview({ items }: { items: PendingItem[] }) {
  const [open, setOpen] = useState(false);
  // Linhas já resolvidas: somem na hora, antes de a página recarregar os números.
  const [done, setDone] = useState<Set<string>>(new Set());
  const visible = items.filter((i) => !done.has(i.id));
  const close = useCallback(() => setOpen(false), []);

  if (visible.length === 0 && !open) return null;
  const count = visible.length;

  return (
    <>
      {/* Computador: faixa com o botão "Revisar agora" */}
      <div
        role="status"
        className="hidden flex-wrap items-center gap-x-4 gap-y-3 rounded-panel border border-line bg-surface py-3.5 pl-[18px] pr-4 lg:flex"
      >
        <span aria-hidden="true" className={`${ICON} size-9`}>
          <CircleAlert className="size-[18px]" />
        </span>
        <p className="min-w-[360px] flex-1 text-[0.9375rem]">
          <strong className="font-semibold">
            {count === 1
              ? "1 atendimento que já terminou está sem resultado."
              : `${count} atendimentos que já terminaram estão sem resultado.`}
          </strong>{" "}
          <span className="text-ink-muted">
            Marque como atendido ou faltou para o faturamento ficar certo.
          </span>
        </p>
        <button
          type="button"
          onClick={() => setOpen(true)}
          className="flex min-h-11 cursor-pointer items-center rounded-field border border-line px-4 text-[0.9375rem] font-semibold text-ink transition-colors hover:bg-primary-soft focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
        >
          Revisar agora
        </button>
      </div>

      {/* Celular: linha inteira toca para revisar */}
      <button
        type="button"
        onClick={() => setOpen(true)}
        aria-label={`${plural(count, "atendimento sem resultado", "atendimentos sem resultado")}. Revisar agora`}
        className="flex min-h-14 w-full cursor-pointer items-center gap-3 rounded-[14px] border border-line bg-surface px-3.5 py-2.5 text-left text-ink lg:hidden"
      >
        <span aria-hidden="true" className={`${ICON} size-8`}>
          <CircleAlert className="size-4" strokeWidth={2.2} />
        </span>
        <span className="flex-1 text-sm">
          <strong className="block font-semibold">
            {plural(count, "atendimento sem resultado", "atendimentos sem resultado")}
          </strong>
          <span className="text-ink-muted">Marque para o faturamento ficar certo</span>
        </span>
        <ChevronRight className="size-[18px] text-ink-muted" aria-hidden="true" />
      </button>

      <ReviewDialog
        open={open}
        items={visible}
        onClose={close}
        onResolved={(id) => setDone((current) => new Set(current).add(id))}
      />
    </>
  );
}

function ReviewDialog({
  open,
  items,
  onClose,
  onResolved,
}: {
  open: boolean;
  items: PendingItem[];
  onClose: () => void;
  onResolved: (id: string) => void;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  const sheetDrag = useSheetDrag(() => ref.current, onClose);
  const router = useRouter();
  const toast = useToast();
  const [busy, setBusy] = useState<string | null>(null);

  useEffect(() => {
    const dialog = ref.current;
    if (!dialog) return;
    if (open && !dialog.open) dialog.showModal();
    if (!open && dialog.open) dialog.close();
  }, [open]);

  // Lista vazia fecha o diálogo (e o aviso some junto).
  useEffect(() => {
    if (open && items.length === 0) onClose();
  }, [open, items.length, onClose]);

  async function resolve(id: string, kind: "completed" | "no_show") {
    if (busy) return;
    setBusy(id);
    try {
      const result =
        kind === "completed" ? await completeBookingAction(id) : await noShowBookingAction(id);
      if (result.ok) {
        toast.show(kind === "completed" ? "Marcado como atendido" : "Marcado como falta");
        onResolved(id);
        router.refresh();
      } else {
        toast.show(result.error, "error");
      }
    } catch {
      toast.show("Não foi possível salvar agora. Tente novamente em instantes.", "error");
    } finally {
      setBusy(null);
    }
  }

  return (
    <dialog
      ref={ref}
      aria-labelledby="pending-title"
      onCancel={(event) => {
        event.preventDefault();
        onClose();
      }}
      onClick={(event) => {
        if (event.target === ref.current) onClose();
      }}
      className="m-auto max-h-[calc(100dvh-3rem)] w-[min(calc(100vw-2rem),560px)] max-w-none overflow-y-auto rounded-panel border border-line bg-surface p-0 text-foreground shadow-float backdrop:bg-ink/40 max-lg:mb-0 max-lg:mt-auto max-lg:max-h-[85dvh] max-lg:w-screen max-lg:rounded-b-none max-lg:border-x-0 max-lg:border-b-0"
    >
      {open ? (
        <div className="flex flex-col gap-4 px-4 pb-6 pt-3 lg:p-6">
          <div {...sheetDrag} aria-hidden="true" className={SHEET_HANDLE_CLASS}>
            <span className="h-1 w-10 rounded-full bg-line" />
          </div>
          <div className="flex items-start justify-between gap-3">
            <div className="flex flex-col gap-1">
              <h2 id="pending-title" className="font-display text-xl font-semibold lg:text-[1.375rem]">
                Atendimentos sem resultado
              </h2>
              <p className="text-sm text-ink-muted">
                Marque o que aconteceu para o faturamento ficar certo.
              </p>
            </div>
            <Button variant="ghost" size="icon" onClick={onClose} aria-label="Fechar" className="-mr-2 -mt-1">
              <X aria-hidden="true" />
            </Button>
          </div>

          <ul className="flex flex-col divide-y divide-line">
            {items.map((item) => (
              <li
                key={item.id}
                className="flex flex-col gap-3 py-3.5 first:pt-0 sm:flex-row sm:items-center sm:justify-between"
              >
                <div className="flex min-w-0 flex-col gap-0.5">
                  <span className="text-[0.8125rem] tabular-nums text-ink-muted">{item.when}</span>
                  <span className="truncate font-semibold">{item.customer}</span>
                  <span className="text-sm text-ink-muted">{item.services}</span>
                </div>
                <div className="grid shrink-0 grid-cols-2 gap-2 sm:w-[212px]">
                  <Button
                    onClick={() => resolve(item.id, "completed")}
                    disabled={busy !== null}
                    aria-label={`Atendido: ${item.customer}, ${item.when}`}
                  >
                    {busy === item.id ? <Loader2 className="animate-spin" aria-hidden="true" /> : null}
                    Atendido
                  </Button>
                  <Button
                    variant="outline"
                    onClick={() => resolve(item.id, "no_show")}
                    disabled={busy !== null}
                    aria-label={`Faltou: ${item.customer}, ${item.when}`}
                  >
                    Faltou
                  </Button>
                </div>
              </li>
            ))}
          </ul>
        </div>
      ) : null}
    </dialog>
  );
}
