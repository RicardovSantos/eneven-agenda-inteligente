"use client";

import { Loader2 } from "lucide-react";
import Link from "next/link";
import { useActionState, useEffect, useRef, useState } from "react";
import { inviteMemberAction, type TeamActionState } from "@/app/painel/configuracoes/actions";
import { PanelDialog } from "@/components/agenda/panel-dialog";
import { FormAlert } from "@/components/auth/form-alert";
import { TextField } from "@/components/auth/text-field";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Select } from "@/components/ui/select";
import { useToast } from "@/components/ui/toast";

export type InvitableProfessional = { id: string; name: string };

const ROLES = [
  { value: "reception", label: "Recepção", hint: "vê e mexe na agenda e nos clientes" },
  { value: "staff", label: "Profissional", hint: "vê só a própria agenda" },
] as const;

/** `id`s do formulário (o `name` "name" já existe em "Seu estabelecimento", na mesma página). */
const FIELD_IDS: Record<string, string> = {
  name: "invite-name",
  email: "invite-email",
  role: "role",
  professionalId: "professionalId",
};
const FIELD_ORDER = Object.keys(FIELD_IDS);

/** "Convidar pessoa": nome, e-mail, papel e (para Profissional) qual profissional da equipe. */
export function InviteDialog({
  open,
  onClose,
  professionals,
}: {
  open: boolean;
  onClose: () => void;
  professionals: InvitableProfessional[];
}) {
  return (
    <PanelDialog open={open} onClose={onClose} title="Convidar pessoa" titleId="invite-title" narrow>
      <InviteForm onClose={onClose} professionals={professionals} />
    </PanelDialog>
  );
}

function InviteForm({
  onClose,
  professionals,
}: {
  onClose: () => void;
  professionals: InvitableProfessional[];
}) {
  const [state, formAction, pending] = useActionState<TeamActionState, FormData>(
    inviteMemberAction,
    {},
  );
  const { show } = useToast();
  const [role, setRole] = useState<"reception" | "staff">("reception");
  const formRef = useRef<HTMLFormElement>(null);
  const handledAt = useRef<number | undefined>(undefined);

  const errors = state.fieldErrors ?? {};
  const noneFree = professionals.length === 0;

  useEffect(() => {
    if (state.at === undefined || state.at === handledAt.current) return;
    handledAt.current = state.at;
    if (state.ok) {
      // Convite criado mas e-mail não enviado: aviso em destaque (o convite aparece na lista).
      show(state.message ?? "Convite enviado", state.emailSent === false ? "error" : "success");
      onClose();
      return;
    }
    const first = FIELD_ORDER.find((name) => state.fieldErrors?.[name]);
    if (first) formRef.current?.querySelector<HTMLElement>(`#${FIELD_IDS[first]}`)?.focus();
  }, [state, show, onClose]);

  return (
    <form ref={formRef} action={formAction} noValidate className="flex flex-col gap-4">
      {state.error ? <FormAlert>{state.error}</FormAlert> : null}

      <TextField
        id="invite-name"
        name="name"
        label="Nome"
        autoComplete="off"
        error={errors.name}
        maxLength={120}
      />
      <TextField
        id="invite-email"
        name="email"
        label="E-mail"
        type="email"
        autoComplete="off"
        autoCapitalize="none"
        spellCheck={false}
        error={errors.email}
        hint="Enviamos o convite para este e-mail."
      />

      <fieldset className="flex flex-col gap-2" aria-describedby={errors.role ? "role-error" : undefined}>
        <legend className="mb-1 text-sm font-medium">Papel</legend>
        {ROLES.map((item) => (
          <label
            key={item.value}
            className="flex min-h-14 cursor-pointer items-start gap-3 rounded-field border border-line bg-surface px-3.5 py-3 has-[:checked]:border-primary has-[:checked]:bg-primary-soft"
          >
            <input
              type="radio"
              id={item.value === "reception" ? "role" : undefined}
              name="role"
              value={item.value}
              checked={role === item.value}
              onChange={() => setRole(item.value)}
              className="mt-0.5 size-5 shrink-0 accent-(--primary)"
            />
            <span className="flex flex-col text-[0.9375rem] leading-snug">
              <span className="font-semibold">{item.label}</span>
              <span className="text-ink-muted">{item.hint}</span>
            </span>
          </label>
        ))}
        {errors.role ? (
          <p id="role-error" className="text-[0.8125rem] leading-snug text-danger">
            {errors.role}
          </p>
        ) : null}
      </fieldset>

      {role === "staff" ? (
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="professionalId">Qual profissional da equipe</Label>
          {noneFree ? (
            <p className="rounded-field bg-primary-soft px-3.5 py-3 text-sm leading-snug text-primary">
              Todos os profissionais ativos já têm acesso.{" "}
              <Link href="/painel/equipe" className="font-semibold underline underline-offset-2">
                Cadastre um novo na Equipe
              </Link>
              .
            </p>
          ) : (
            <Select
              id="professionalId"
              name="professionalId"
              defaultValue=""
              aria-invalid={errors.professionalId ? true : undefined}
              aria-describedby={errors.professionalId ? "professionalId-error" : undefined}
            >
              <option value="" disabled>
                Escolha o profissional
              </option>
              {professionals.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}
                </option>
              ))}
            </Select>
          )}
          {errors.professionalId ? (
            <p id="professionalId-error" className="text-[0.8125rem] leading-snug text-danger">
              {errors.professionalId}
            </p>
          ) : null}
        </div>
      ) : null}

      <div className="mt-1 flex flex-col-reverse gap-3 sm:flex-row sm:justify-end">
        <Button type="button" variant="outline" onClick={onClose} className="sm:px-6">
          Voltar
        </Button>
        <Button type="submit" disabled={pending || (role === "staff" && noneFree)} className="sm:px-6">
          {pending ? (
            <>
              <Loader2 className="animate-spin" aria-hidden="true" />
              Enviando…
            </>
          ) : (
            "Enviar convite"
          )}
        </Button>
      </div>
    </form>
  );
}
