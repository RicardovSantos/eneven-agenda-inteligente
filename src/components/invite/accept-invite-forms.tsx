"use client";

import { useActionState, useEffect, useRef, useState } from "react";
import {
  acceptInviteAction,
  acceptInviteAsCurrentUserAction,
  type InviteFormState,
} from "@/app/convite/[token]/actions";
import { FormAlert } from "@/components/auth/form-alert";
import { PasswordField } from "@/components/auth/password-field";
import { SubmitButton } from "@/components/auth/submit-button";
import { TextField } from "@/components/auth/text-field";

const INITIAL: InviteFormState = {};

/**
 * Criar o acesso: Nome (preenchido com o do convite) + Senha. No convite de
 * proprietário (`askName` falso) só a senha. O token vai num campo oculto: já
 * está na URL desta página.
 */
export function AcceptPasswordForm({
  token,
  defaultName,
  askName,
  alert,
}: {
  token: string;
  defaultName: string;
  askName: boolean;
  /** Erro vindo da URL (ex.: Google recusado); some quando a pessoa tenta de novo. */
  alert?: string;
}) {
  const [state, formAction, pending] = useActionState<InviteFormState, FormData>(
    acceptInviteAction,
    INITIAL,
  );
  const [name, setName] = useState(defaultName);
  const formRef = useRef<HTMLFormElement>(null);

  const errors = state.fieldErrors ?? {};
  const shownAlert = state === INITIAL ? alert : undefined;

  useEffect(() => {
    const id = errors.name ? "name" : errors.password ? "password" : null;
    if (id) formRef.current?.querySelector<HTMLElement>(`#${id}`)?.focus();
  }, [errors.name, errors.password]);

  return (
    <form ref={formRef} action={formAction} noValidate className="flex flex-col gap-4">
      <input type="hidden" name="token" value={token} />
      {(state.error ?? shownAlert) ? <FormAlert>{state.error ?? shownAlert}</FormAlert> : null}

      {askName ? (
        <TextField
          name="name"
          label="Nome"
          autoComplete="name"
          value={name}
          onChange={(e) => setName(e.target.value)}
          error={errors.name}
          maxLength={120}
        />
      ) : null}

      <PasswordField
        label="Senha"
        autoComplete="new-password"
        error={errors.password}
        hint="Mínimo de 8 caracteres"
      />

      <div className="pt-1">
        <SubmitButton
          pending={pending}
          idleLabel={askName ? "Criar acesso" : "Criar senha e entrar"}
          pendingLabel="Criando acesso…"
        />
      </div>
    </form>
  );
}

/** "Aceitar convite": para quem já está logado com o e-mail convidado (o usuário vem da sessão). */
export function AcceptSessionForm({ token, alert }: { token: string; alert?: string }) {
  const [state, formAction, pending] = useActionState<InviteFormState, FormData>(
    acceptInviteAsCurrentUserAction,
    INITIAL,
  );
  const shownAlert = state === INITIAL ? alert : undefined;

  return (
    <form action={formAction} className="flex flex-col gap-4">
      <input type="hidden" name="token" value={token} />
      {(state.error ?? shownAlert) ? <FormAlert>{state.error ?? shownAlert}</FormAlert> : null}
      <SubmitButton pending={pending} idleLabel="Aceitar convite" pendingLabel="Aceitando…" />
    </form>
  );
}
