import { Loader2 } from "lucide-react";
import type { ReactNode } from "react";
import { FormAlert } from "@/components/auth/form-alert";
import { Button } from "@/components/ui/button";

/** Cartão de uma seção de Configurações (`--surface`, borda, raio 16px). */
export function SettingsSection({
  id,
  title,
  description,
  children,
}: {
  id: string;
  title: string;
  description?: ReactNode;
  children: ReactNode;
}) {
  return (
    <section
      aria-labelledby={`${id}-title`}
      className="flex flex-col gap-5 rounded-panel border border-line bg-surface p-5 sm:p-6"
    >
      <header className="flex flex-col gap-1">
        <h2 id={`${id}-title`} className="text-xl font-semibold">
          {title}
        </h2>
        {description ? (
          <p className="text-sm leading-snug text-ink-muted">{description}</p>
        ) : null}
      </header>
      {children}
    </section>
  );
}

/** Erro geral + botão "Salvar" alinhado à direita (largura total no celular). */
export function SaveRow({
  pending,
  error,
  disabled,
  label = "Salvar",
}: {
  pending: boolean;
  error?: string;
  disabled?: boolean;
  label?: string;
}) {
  return (
    <div className="flex flex-col gap-3">
      {error ? <FormAlert>{error}</FormAlert> : null}
      <div className="flex sm:justify-end">
        <Button
          type="submit"
          disabled={pending || disabled}
          className="w-full px-6 sm:w-auto"
        >
          {pending ? (
            <>
              <Loader2 className="animate-spin" aria-hidden="true" />
              Salvando…
            </>
          ) : (
            label
          )}
        </Button>
      </div>
    </div>
  );
}
