"use client";

import { useActionState, useEffect, useRef, useState } from "react";
import type { AuthFormState } from "@/app/(auth)/actions";
import {
  completeGoogleSignupAction,
  discardGooglePendingAction,
} from "@/app/(auth)/google-actions";
import { PUBLIC_HOST } from "@/lib/brand";
import { initialOf } from "@/lib/initial";
import { formatBrazilPhone } from "@/lib/phone";
import { slugify } from "@/lib/slugify";
import { FormAlert } from "./form-alert";
import { SubmitButton } from "./submit-button";
import { TextField } from "./text-field";

const FIELD_ORDER = ["businessName", "whatsapp"];

/** Segunda etapa do cadastro de quem veio do Google: estabelecimento e WhatsApp. */
export function CompleteGoogleForm({
  email,
  name,
  picture,
}: {
  email: string;
  /** Nome da conta Google (a inicial vira o avatar quando não há foto). */
  name: string;
  picture: string | null;
}) {
  const [state, formAction, pending] = useActionState<AuthFormState, FormData>(
    completeGoogleSignupAction,
    {},
  );
  const [businessName, setBusinessName] = useState("");
  const [whatsapp, setWhatsapp] = useState("");
  const [pictureFailed, setPictureFailed] = useState(false);
  const formRef = useRef<HTMLFormElement>(null);

  const errors = state.fieldErrors ?? {};

  useEffect(() => {
    const first = FIELD_ORDER.find((name) => state.fieldErrors?.[name]);
    if (first) formRef.current?.querySelector<HTMLElement>(`#${first}`)?.focus();
  }, [state]);

  return (
    <div className="flex flex-col gap-8">
      <div className="flex flex-col gap-2">
        <h1 className="text-[1.75rem] font-semibold">Falta pouco</h1>
        <p className="text-ink-muted">
          Conte qual é o seu estabelecimento para criarmos sua agenda.
        </p>
      </div>

      <div className="flex items-center gap-3">
        {picture && !pictureFailed ? (
          // Foto do Google: imagem externa, sem repassar o endereço da página.
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={picture}
            alt=""
            width={32}
            height={32}
            referrerPolicy="no-referrer"
            onError={() => setPictureFailed(true)}
            // A imagem pode falhar antes da hidratação (o `onError` não dispara).
            ref={(img) => {
              if (img?.complete && img.naturalWidth === 0) setPictureFailed(true);
            }}
            className="size-8 shrink-0 rounded-full bg-primary-soft object-cover"
          />
        ) : (
          <span
            className="flex size-8 shrink-0 items-center justify-center rounded-full bg-primary-soft text-sm font-semibold text-primary"
            aria-hidden="true"
          >
            {initialOf(name)}
          </span>
        )}
        <p className="min-w-0 flex-1 truncate text-ink-muted">{email}</p>
        <form action={discardGooglePendingAction}>
          <button
            type="submit"
            className="shrink-0 text-sm font-medium text-primary underline-offset-2 hover:underline"
          >
            Usar outra conta
          </button>
        </form>
      </div>

      <form
        ref={formRef}
        action={formAction}
        noValidate
        className="flex flex-col gap-4"
      >
        {state.error ? <FormAlert>{state.error}</FormAlert> : null}

        <TextField
          name="businessName"
          label="Nome do estabelecimento"
          placeholder="Ex.: Studio Defendi"
          autoComplete="organization"
          value={businessName}
          onChange={(e) => setBusinessName(e.target.value)}
          error={errors.businessName}
          below={
            businessName.trim() ? (
              <>
                Seu link: {PUBLIC_HOST}/
                <strong className="font-semibold text-foreground">
                  {slugify(businessName)}
                </strong>
              </>
            ) : null
          }
        />

        <TextField
          name="whatsapp"
          label="WhatsApp"
          type="tel"
          inputMode="tel"
          autoComplete="tel-national"
          placeholder="(11) 99999-9999"
          value={whatsapp}
          onChange={(e) => setWhatsapp(formatBrazilPhone(e.target.value))}
          error={errors.whatsapp}
        />

        <div className="pt-1">
          <SubmitButton
            pending={pending}
            idleLabel="Criar minha agenda"
            pendingLabel="Criando sua agenda…"
          />
        </div>
      </form>
    </div>
  );
}
