"use client";

import { CircleAlert, CircleCheck, X } from "lucide-react";
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";

type ToastTone = "success" | "error";
type ToastAction = { label: string; href: string };
type ToastItem = { id: number; message: string; tone: ToastTone; action?: ToastAction };

type ToastApi = {
  /** Confirmação discreta no rodapé (4 s). Use o mesmo verbo do botão. */
  show: (message: string, tone?: ToastTone, action?: ToastAction) => void;
};

const TOAST_MS = 4000;
/** Toast com ação (ex.: "Avisar pelo WhatsApp") não some sozinho: fica até ser dispensado. */
const ToastContext = createContext<ToastApi | null>(null);

export function useToast(): ToastApi {
  const ctx = useContext(ToastContext);
  if (!ctx) throw new Error("useToast precisa estar dentro de <ToastProvider>");
  return ctx;
}

/**
 * Dispara um toast quando `at` muda (resultado novo de uma ação do servidor).
 * `message`/`error` vazios não fazem nada.
 */
export function useToastOnResult(state: {
  at?: number;
  message?: string;
  error?: string;
}) {
  const { show } = useToast();
  const lastAt = useRef<number | undefined>(undefined);
  useEffect(() => {
    if (state.at === undefined || state.at === lastAt.current) return;
    lastAt.current = state.at;
    if (state.error) show(state.error, "error");
    else if (state.message) show(state.message, "success");
  }, [state, show]);
}

export function ToastProvider({ children }: { children: ReactNode }) {
  const [items, setItems] = useState<ToastItem[]>([]);
  const nextId = useRef(1);

  const show = useCallback((message: string, tone: ToastTone = "success", action?: ToastAction) => {
    const id = nextId.current++;
    setItems((current) => [...current.slice(-2), { id, message, tone, action }]);
    if (!action) {
      setTimeout(() => {
        setItems((current) => current.filter((item) => item.id !== id));
      }, TOAST_MS);
    }
  }, []);

  const dismiss = useCallback((id: number) => {
    setItems((current) => current.filter((item) => item.id !== id));
  }, []);

  const api = useMemo(() => ({ show }), [show]);

  return (
    <ToastContext.Provider value={api}>
      {children}
      {/* Acima da navegação inferior no celular; no rodapé em telas largas. */}
      <div
        aria-live="polite"
        className="pointer-events-none fixed inset-x-0 bottom-[calc(5rem+env(safe-area-inset-bottom))] z-50 flex flex-col items-center gap-2 px-4 lg:bottom-6 lg:pl-[calc(232px+1rem)]"
      >
        {items.map((item) => (
          <div
            key={item.id}
            role={item.tone === "error" ? "alert" : "status"}
            className="pointer-events-auto flex max-w-md items-center gap-2.5 rounded-field bg-ink px-4 py-3 text-sm font-medium leading-snug text-canvas shadow-float animate-in fade-in slide-in-from-bottom-2"
          >
            {item.tone === "error" ? (
              <CircleAlert className="size-5 shrink-0 text-[#fb923c]" aria-hidden="true" />
            ) : (
              <CircleCheck className="size-5 shrink-0 text-[#3dd68c]" aria-hidden="true" />
            )}
            <span>{item.message}</span>
            {item.action ? (
              <a
                href={item.action.href}
                target="_blank"
                rel="noopener noreferrer"
                className="ml-1 flex min-h-11 shrink-0 items-center rounded-md bg-canvas/15 px-3 font-semibold text-canvas underline-offset-2 hover:underline"
              >
                {item.action.label}
              </a>
            ) : null}
            {item.action ? (
              <button
                type="button"
                onClick={() => dismiss(item.id)}
                aria-label="Dispensar aviso"
                className="flex size-11 shrink-0 cursor-pointer items-center justify-center rounded-md text-canvas/80 hover:bg-canvas/15"
              >
                <X className="size-5" aria-hidden="true" />
              </button>
            ) : null}
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  );
}
