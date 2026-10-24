"use client";

import { useActionState, useEffect, useRef } from "react";
import { resetPasswordAction, type AuthFormState } from "@/app/(auth)/actions";
import { FormAlert } from "./form-alert";
import { PasswordField } from "./password-field";
import { SubmitButton } from "./submit-button";

export function ResetPasswordForm({ token }: { token: string }) {
  const [state, formAction, pending] = useActionState<AuthFormState, FormData>(
    resetPasswordAction,
    {},
  );
  const formRef = useRef<HTMLFormElement>(null);
  const errors = state.fieldErrors ?? {};

  useEffect(() => {
    const id = errors.password
      ? "password"
      : errors.confirmPassword
        ? "confirmPassword"
        : null;
    if (id) formRef.current?.querySelector<HTMLElement>(`#${id}`)?.focus();
  }, [errors.password, errors.confirmPassword]);

  return (
    <div className="flex flex-col gap-8">
      <div className="flex flex-col gap-2">
        <h1 className="text-[1.75rem] font-semibold">Criar nova senha</h1>
        <p className="text-ink-muted">Escolha uma senha que você ainda não usou aqui.</p>
      </div>

      <form
        ref={formRef}
        action={formAction}
        noValidate
        className="flex flex-col gap-4"
      >
        <input type="hidden" name="token" value={token} />
        {state.error ? <FormAlert>{state.error}</FormAlert> : null}

        <PasswordField
          name="password"
          label="Nova senha"
          autoComplete="new-password"
          hint="Mínimo de 8 caracteres"
          error={errors.password}
        />
        <PasswordField
          name="confirmPassword"
          label="Confirmar nova senha"
          autoComplete="new-password"
          error={errors.confirmPassword}
        />

        <div className="pt-1">
          <SubmitButton
            pending={pending}
            idleLabel="Salvar nova senha"
            pendingLabel="Salvando…"
          />
        </div>
      </form>
    </div>
  );
}
