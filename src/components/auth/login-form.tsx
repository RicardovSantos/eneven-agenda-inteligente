"use client";

import Link from "next/link";
import { useActionState, useEffect, useRef, useState } from "react";
import { loginAction, type AuthFormState } from "@/app/(auth)/actions";
import { FormAlert, FormNotice } from "./form-alert";
import { PasswordField } from "./password-field";
import { SubmitButton } from "./submit-button";
import { TextField } from "./text-field";

export function LoginForm({ notice }: { notice?: string }) {
  const [state, formAction, pending] = useActionState<AuthFormState, FormData>(
    loginAction,
    {},
  );
  const [email, setEmail] = useState("");
  const formRef = useRef<HTMLFormElement>(null);

  const errors = state.fieldErrors ?? {};

  // Depois de um erro, leva o foco ao campo certo.
  useEffect(() => {
    const id = state.fieldErrors?.email
      ? "email"
      : state.fieldErrors?.password || state.error
        ? "password"
        : null;
    if (id) formRef.current?.querySelector<HTMLElement>(`#${id}`)?.focus();
  }, [state]);

  return (
    <div className="flex flex-col gap-8">
      <h1 className="text-[1.75rem] font-semibold">Entrar na sua agenda</h1>

      <form
        ref={formRef}
        action={formAction}
        noValidate
        className="flex flex-col gap-4"
      >
        {notice ? <FormNotice>{notice}</FormNotice> : null}
        {state.error ? <FormAlert>{state.error}</FormAlert> : null}

        <TextField
          name="email"
          label="E-mail"
          type="email"
          autoComplete="email"
          autoCapitalize="none"
          spellCheck={false}
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          error={errors.email}
        />

        <PasswordField
          label="Senha"
          autoComplete="current-password"
          error={errors.password}
          labelAside={
            <Link
              href="/recuperar-senha"
              className="text-sm font-medium text-primary underline-offset-2 hover:underline"
            >
              Esqueci minha senha
            </Link>
          }
        />

        <div className="pt-1">
          <SubmitButton
            pending={pending}
            idleLabel="Entrar"
            pendingLabel="Entrando…"
          />
        </div>
      </form>

      <p className="text-ink-muted">
        Ainda não tem conta?{" "}
        <Link href="/cadastro" className="font-semibold text-primary underline-offset-2 hover:underline">
          Criar agenda grátis
        </Link>
      </p>
    </div>
  );
}
