"use client";

import { Loader2 } from "lucide-react";
import { useActionState } from "react";
import { resendVerificationAction, type ResendState } from "@/app/(auth)/actions";
import { Button } from "@/components/ui/button";

/** Faixa "Confirme seu e-mail" do painel, com o botão "Reenviar e-mail". */
export function ResendVerification({ email }: { email: string }) {
  const [state, formAction, pending] = useActionState<ResendState, FormData>(
    resendVerificationAction,
    {},
  );

  return (
    <form
      action={formAction}
      className="flex flex-col gap-3 rounded-field border-l-[3px] border-danger bg-danger-soft px-4 py-3"
    >
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <p className="text-sm leading-snug">
          Confirme seu e-mail para liberar seu link de agendamento. Enviamos para{" "}
          <strong className="font-semibold break-all">{email}</strong>.
        </p>
        <Button type="submit" variant="outline" disabled={pending} className="shrink-0">
          {pending ? (
            <>
              <Loader2 className="animate-spin" aria-hidden="true" />
              Enviando…
            </>
          ) : (
            "Reenviar e-mail"
          )}
        </Button>
      </div>
      <div aria-live="polite">
        {state.success ? (
          <p className="text-sm leading-snug font-medium">{state.success}</p>
        ) : null}
        {state.error ? (
          <p className="text-sm leading-snug font-medium text-danger">{state.error}</p>
        ) : null}
      </div>
    </form>
  );
}
