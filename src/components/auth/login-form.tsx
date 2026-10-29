"use client";

import Link from "next/link";
import { useActionState, useEffect, useRef, useState } from "react";
import { loginAction, type AuthFormState } from "@/app/(auth)/actions";
import { FormAlert, FormNotice } from "./form-alert";
import { GoogleSection } from "./google-button";
import { PasswordField } from "./password-field";
import { SubmitButton } from "./submit-button";
import { TextField } from "./text-field";

/** Estado de antes do primeiro envio; depois dele o `alert` da URL some. */
const INITIAL_STATE: AuthFormState = {};

export function LoginForm({
  notice,
  alert,
  googleEnabled = false,
  invite,
}: {
  notice?: string;
  /** Erro geral vindo da URL (ex.: falha ao entrar com o Google). */
  alert?: string;
  /** Mostra "Entrar com Google" (só quando as credenciais estão configuradas). */
  googleEnabled?: boolean;
  /** Convite a aceitar depois de entrar (a página do convite manda para cá). */
  invite?: { token: string; email: string };
}) {
  const [state, formAction, pending] = useActionState<AuthFormState, FormData>(
    loginAction,
    INITIAL_STATE,
  );
  const [email, setEmail] = useState(invite?.email ?? "");
  const formRef = useRef<HTMLFormElement>(null);

  const errors = state.fieldErrors ?? {};
  // O aviso vindo da URL (?erro=google) vale só até a pessoa tentar de novo.
  const shownAlert = state === INITIAL_STATE ? alert : undefined;

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

      <div className="flex flex-col gap-6">
        <form
          ref={formRef}
          action={formAction}
          noValidate
          className="flex flex-col gap-4"
        >
          {invite ? <input type="hidden" name="convite" value={invite.token} /> : null}
          {notice ? <FormNotice>{notice}</FormNotice> : null}
          {(state.error ?? shownAlert) ? (
            <FormAlert>{state.error ?? shownAlert}</FormAlert>
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

        {googleEnabled && !invite ? <GoogleSection intent="login" /> : null}
      </div>

      <p className="text-ink-muted">
        Ainda não tem conta?{" "}
        <Link
          href="/cadastro"
          className="font-semibold text-primary underline-offset-2 hover:underline"
        >
          Criar agenda grátis
        </Link>
      </p>
    </div>
  );
}
