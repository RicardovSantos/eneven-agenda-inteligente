import type { ComponentProps, ReactNode } from "react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

type TextFieldProps = Omit<ComponentProps<"input">, "id" | "name"> & {
  /** Vira o `id` e o `name` do campo. */
  name: string;
  label: string;
  /** Mensagem de erro do campo (texto já em português). */
  error?: ReactNode;
  /** Ajuda abaixo do campo (some quando há erro). */
  hint?: ReactNode;
  /** Conteúdo à direita do rótulo (ex.: "Esqueci minha senha"). */
  labelAside?: ReactNode;
  /** Conteúdo dentro do campo, à direita (ex.: botão de olho). */
  adornment?: ReactNode;
  /** Conteúdo logo abaixo do campo (ex.: prévia do link). */
  below?: ReactNode;
};

/** Rótulo visível, campo, ajuda e erro ligados por `aria-describedby`. */
export function TextField({
  name,
  label,
  error,
  hint,
  labelAside,
  adornment,
  below,
  ...inputProps
}: TextFieldProps) {
  const errorId = `${name}-error`;
  const hintId = `${name}-hint`;
  const describedBy =
    [error ? errorId : null, !error && hint ? hintId : null, below ? `${name}-below` : null]
      .filter(Boolean)
      .join(" ") || undefined;

  return (
    <div className="flex flex-col gap-1.5">
      <div className="flex items-baseline justify-between gap-3">
        <Label htmlFor={name}>{label}</Label>
        {labelAside}
      </div>
      <div className="relative">
        <Input
          id={name}
          name={name}
          aria-invalid={error ? true : undefined}
          aria-describedby={describedBy}
          className={adornment ? "pr-12" : undefined}
          {...inputProps}
        />
        {adornment ? (
          <div className="absolute inset-y-0 right-0 flex items-center">
            {adornment}
          </div>
        ) : null}
      </div>
      {below ? (
        <div id={`${name}-below`} className="text-[0.8125rem] leading-snug text-ink-muted">
          {below}
        </div>
      ) : null}
      {error ? (
        <p id={errorId} className="text-[0.8125rem] leading-snug text-danger">
          {error}
        </p>
      ) : hint ? (
        <p id={hintId} className="text-[0.8125rem] leading-snug text-ink-muted">
          {hint}
        </p>
      ) : null}
    </div>
  );
}
