"use client";

import { Eye, EyeOff } from "lucide-react";
import { useState, type ComponentProps, type ReactNode } from "react";
import { TextField } from "./text-field";

type PasswordFieldProps = Omit<
  ComponentProps<typeof TextField>,
  "type" | "adornment" | "name"
> & {
  name?: string;
  labelAside?: ReactNode;
};

/** Campo de senha com botão de olho para mostrar ou ocultar. */
export function PasswordField({ name = "password", ...props }: PasswordFieldProps) {
  const [visible, setVisible] = useState(false);
  const Icon = visible ? EyeOff : Eye;

  return (
    <TextField
      {...props}
      name={name}
      type={visible ? "text" : "password"}
      autoCapitalize="none"
      spellCheck={false}
      adornment={
        <button
          type="button"
          onClick={() => setVisible((v) => !v)}
          aria-label={visible ? "Ocultar senha" : "Mostrar senha"}
          aria-pressed={visible}
          className="flex size-11 items-center justify-center rounded-field text-ink-muted transition-colors hover:text-foreground"
        >
          <Icon className="size-5" aria-hidden="true" />
        </button>
      }
    />
  );
}
