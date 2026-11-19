"use client";

import { Loader2 } from "lucide-react";
import { useActionState } from "react";
import { deleteAccountAction, type DeleteAccountState } from "@/app/painel/conta/excluir/actions";
import { FormAlert } from "@/components/auth/form-alert";
import { PasswordField } from "@/components/auth/password-field";
import { TextField } from "@/components/auth/text-field";
import { DELETE_CONFIRMATION_WORD } from "@/server/account/errors";

/** Confirmação da exclusão: digitar EXCLUIR e, em conta com senha, a senha atual. */
export function DeleteAccountForm({ hasPassword, owner }: { hasPassword: boolean; owner: boolean }) {
  const [state, formAction, pending] = useActionState<DeleteAccountState, FormData>(deleteAccountAction, {});
  return (
    <form action={formAction} className="flex flex-col gap-4">
      {state.error ? <FormAlert>{state.error}</FormAlert> : null}
      <TextField
        name="confirmation"
        label={`Digite ${DELETE_CONFIRMATION_WORD} para confirmar`}
        autoComplete="off"
        autoCapitalize="characters"
        spellCheck={false}
        required
      />
      {hasPassword ? <PasswordField label="Sua senha" autoComplete="current-password" required /> : null}
      <button
        type="submit"
        disabled={pending}
        className="flex min-h-12 w-full items-center justify-center gap-2 rounded-field border border-danger bg-danger px-5 text-center font-semibold text-white disabled:opacity-60"
      >
        {pending ? <Loader2 className="size-4 animate-spin" aria-hidden="true" /> : null}
        {pending ? "Excluindo…" : owner ? "Excluir minha conta e o estabelecimento" : "Excluir minha conta"}
      </button>
    </form>
  );
}
