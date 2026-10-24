"use client";

import Link from "next/link";
import { useActionState, useEffect, useRef, useState } from "react";
import { forgotPasswordAction, type AuthFormState } from "@/app/(auth)/actions";
import { FormAlert, FormNotice } from "./form-alert";
import { SubmitButton } from "./submit-button";
import { TextField } from "./text-field";

export function ForgotPasswordForm() {
  const [state, formAction, pending] = useActionState<AuthFormState, FormData>(
    forgotPasswordAction,
    {},
  );
  const [email, setEmail] = useState("");
  const formRef = useRef<HTMLFormElement>(null);

  useEffect(() => {
    if (state.fieldErrors?.email) {
      formRef.current?.querySelector<HTMLElement>("#email")?.focus();
    }
  }, [state]);

  return (
    <div className="flex flex-col gap-8">
      <div className="flex flex-col gap-2">
        <h1 className="text-[1.75rem] font-semibold">Recuperar senha</h1>
        <p className="text-ink-muted">
          Informe seu e-mail e enviaremos um link para criar uma nova senha.
        </p>
      </div>

      <form
        ref={formRef}
        action={formAction}
        noValidate
        className="flex flex-col gap-4"
      >
        {state.error ? <FormAlert>{state.error}</FormAlert> : null}
        {state.sent ? (
          <FormNotice>
            Se houver uma conta com esse e-mail, enviamos um link para redefinir a senha.
          </FormNotice>
        ) : null}

        <TextField
          name="email"
          label="E-mail"
          type="email"
          autoComplete="email"
          autoCapitalize="none"
          spellCheck={false}
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          error={state.fieldErrors?.email}
        />

        <div className="pt-1">
          <SubmitButton
            pending={pending}
            idleLabel="Enviar link"
            pendingLabel="Enviando…"
          />
        </div>
      </form>

      <p className="text-ink-muted">
        <Link href="/entrar" className="font-semibold text-primary underline-offset-2 hover:underline">
          Voltar para entrar
        </Link>
      </p>
    </div>
  );
}
