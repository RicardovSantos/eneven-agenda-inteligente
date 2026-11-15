"use client";

import { Loader2 } from "lucide-react";
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useId,
  useMemo,
  useState,
  startTransition,
  type FormEvent,
  type ReactNode,
} from "react";
import { FormAlert } from "@/components/auth/form-alert";
import { Button } from "@/components/ui/button";

type Entry = { pending: boolean; disabled: boolean; submit: () => void };
type Api = {
  set: (id: string, entry: Entry) => void;
  remove: (id: string) => void;
};

const SaveContext = createContext<Api | null>(null);

/**
 * Uma tela de Configurações tem um único botão "Salvar", fixo no rodapé. Cada
 * formulário da tela se registra aqui (`useSettingsForm`) e o botão envia todos
 * os que estão aptos de uma vez.
 */
export function SettingsSaveProvider({ children }: { children: ReactNode }) {
  const [entries, setEntries] = useState<Record<string, Entry>>({});

  const api = useMemo<Api>(
    () => ({
      set: (id, entry) =>
        setEntries((current) => {
          const previous = current[id];
          if (
            previous &&
            previous.pending === entry.pending &&
            previous.disabled === entry.disabled &&
            previous.submit === entry.submit
          ) {
            return current;
          }
          return { ...current, [id]: entry };
        }),
      remove: (id) =>
        setEntries((current) => {
          if (!(id in current)) return current;
          const next = { ...current };
          delete next[id];
          return next;
        }),
    }),
    [],
  );

  const list = Object.values(entries);
  const pending = list.some((e) => e.pending);
  const ready = list.filter((e) => !e.disabled);

  return (
    <SaveContext.Provider value={api}>
      {children}
      {list.length > 0 ? (
        <div className="pointer-events-none sticky bottom-[calc(4.25rem+1px+env(safe-area-inset-bottom))] z-10 -mx-4 mt-2 px-4 pb-3 pt-6 lg:bottom-0 lg:mx-0 lg:px-0 lg:pb-4">
          <div
            aria-hidden="true"
            className="absolute inset-0 bg-gradient-to-t from-canvas via-canvas/90 to-transparent"
          />
          <Button
            type="button"
            disabled={pending || ready.length === 0}
            onClick={() => ready.forEach((entry) => entry.submit())}
            className="pointer-events-auto relative h-12 w-full lg:ml-auto lg:flex lg:w-auto lg:min-w-40"
          >
            {pending ? (
              <>
                <Loader2 className="animate-spin" aria-hidden="true" />
                Salvando…
              </>
            ) : (
              "Salvar"
            )}
          </Button>
        </div>
      ) : null}
    </SaveContext.Provider>
  );
}

/**
 * Registra um formulário no botão fixo da tela. Devolve `ref` e `onSubmit` para o `<form>`
 * (use no lugar de `action`).
 * `disabled`: não há o que salvar ou os dados são inválidos (o botão pula este).
 */
export function useSettingsForm({
  pending,
  disabled = false,
  action,
}: {
  pending: boolean;
  disabled?: boolean;
  /** O `formAction` do `useActionState` do formulário. */
  action: (formData: FormData) => void;
}): {
  setFormElement: (element: HTMLFormElement | null) => void;
  onSubmit: (event: FormEvent<HTMLFormElement>) => void;
} {
  const api = useContext(SaveContext);
  const id = useId();
  const [element, setFormElement] = useState<HTMLFormElement | null>(null);
  const submit = useCallback(() => element?.requestSubmit(), [element]);

  useEffect(() => {
    api?.set(id, { pending, disabled, submit });
  }, [api, id, pending, disabled, submit]);
  useEffect(() => () => api?.remove(id), [api, id]);

  // Não usamos `<form action>`: ao terminar, o React 19 chama `form.reset()`, e num
  // <select> controlado isso devolve o valor antigo na tela (e no próximo envio).
  const onSubmit = useCallback(
    (event: FormEvent<HTMLFormElement>) => {
      event.preventDefault();
      const data = new FormData(event.currentTarget);
      startTransition(() => action(data));
    },
    [action],
  );

  return { setFormElement, onSubmit };
}

/**
 * Fim do formulário: mostra o erro geral e tem um envio escondido para o Enter
 * continuar salvando. O botão visível é o fixo da tela.
 */
export function FormFooter({ error }: { error?: string }) {
  return (
    <>
      {error ? <FormAlert>{error}</FormAlert> : null}
      <button type="submit" hidden aria-hidden="true" tabIndex={-1} />
    </>
  );
}
