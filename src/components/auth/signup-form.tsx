"use client";

import Link from "next/link";
import { useActionState, useEffect, useRef, useState } from "react";
import { signupAction, type AuthFormState } from "@/app/(auth)/actions";
import { PUBLIC_HOST } from "@/lib/brand";
import { formatBrazilPhone } from "@/lib/phone";
import { slugify } from "@/lib/slugify";
import { FormAlert } from "./form-alert";
import { PasswordField } from "./password-field";
import { SubmitButton } from "./submit-button";
import { TextField } from "./text-field";

const FIELD_ORDER = ["businessName", "ownerName", "whatsapp", "email", "password"];

export function SignupForm() {
  const [state, formAction, pending] = useActionState<AuthFormState, FormData>(
    signupAction,
    {},
  );
  const [businessName, setBusinessName] = useState("");
  const [ownerName, setOwnerName] = useState("");
  const [whatsapp, setWhatsapp] = useState("");
  const [email, setEmail] = useState("");
  const formRef = useRef<HTMLFormElement>(null);

  const errors = state.fieldErrors ?? {};

  // Depois de um erro, leva o foco ao primeiro campo com problema.
  useEffect(() => {
    const first = FIELD_ORDER.find((name) => state.fieldErrors?.[name]);
    if (first) formRef.current?.querySelector<HTMLElement>(`#${first}`)?.focus();
  }, [state]);

  return (
    <div className="flex flex-col gap-8">
      <div className="flex flex-col gap-2">
        <h1 className="text-[1.75rem] font-semibold">Crie sua agenda online</h1>
        <p className="text-ink-muted">14 dias grátis. Sem cartão de crédito.</p>
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
          name="ownerName"
          label="Seu nome"
          autoComplete="name"
          value={ownerName}
          onChange={(e) => setOwnerName(e.target.value)}
          error={errors.ownerName}
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

        <TextField
          name="email"
          label="E-mail"
          type="email"
          autoComplete="email"
          autoCapitalize="none"
          spellCheck={false}
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          error={
            errors.email && state.emailTaken ? (
              <>
                Este e-mail já tem uma conta.{" "}
                <Link href="/entrar" className="font-semibold underline underline-offset-2">
                  Entre
                </Link>{" "}
                ou recupere a senha.
              </>
            ) : (
              errors.email
            )
          }
        />

        <PasswordField
          label="Senha"
          autoComplete="new-password"
          hint="Mínimo de 8 caracteres"
          error={errors.password}
        />

        <div className="flex flex-col gap-4 pt-1">
          <SubmitButton
            pending={pending}
            idleLabel="Criar minha agenda"
            pendingLabel="Criando sua agenda…"
          />
          <p className="text-[0.8125rem] leading-snug text-ink-muted">
            Ao criar sua conta você concorda com os{" "}
            <Link href="/termos" className="text-primary underline underline-offset-2">
              Termos de uso
            </Link>{" "}
            e a{" "}
            <Link href="/privacidade" className="text-primary underline underline-offset-2">
              Política de privacidade
            </Link>
            .
          </p>
        </div>
      </form>

      <p className="text-ink-muted">
        Já tem conta?{" "}
        <Link href="/entrar" className="font-semibold text-primary underline-offset-2 hover:underline">
          Entrar
        </Link>
      </p>
    </div>
  );
}
