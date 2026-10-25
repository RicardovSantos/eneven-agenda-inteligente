"use client";

import { ExternalLink, Loader2 } from "lucide-react";
import { useState, useTransition } from "react";
import { completeOnboardingAction } from "@/app/painel/comecar/actions";
import { FormAlert } from "@/components/auth/form-alert";
import { CompletionCheck } from "@/components/brand/completion-check";
import { ResendVerification } from "@/components/panel/resend-verification";
import { Button, buttonVariants } from "@/components/ui/button";
import { PUBLIC_HOST } from "@/lib/brand";
import { CopyButton } from "./parts";

/** Tela final: "Sua agenda está pronta", com o link e o texto para o WhatsApp. */
export function StepDone({
  slug,
  emailVerified,
  userEmail,
  onFinish,
}: {
  slug: string;
  emailVerified: boolean;
  userEmail: string;
  onFinish: () => void;
}) {
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  const shown = `${PUBLIC_HOST}/${slug}`;
  const url = `https://${shown}`;
  const whatsappText = `Agende seu horário online: ${shown}`;

  const goToAgenda = () => {
    setError(null);
    startTransition(async () => {
      const result = await completeOnboardingAction();
      if (!result.ok) {
        setError(result.error ?? "Não foi possível concluir agora.");
        return;
      }
      onFinish();
    });
  };

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col items-center gap-5 pt-2 text-center">
        <CompletionCheck />
        <div className="flex flex-col gap-1.5">
          <h1 className="text-[1.625rem] font-semibold">Sua agenda está pronta</h1>
          <p className="text-[0.9375rem] leading-snug text-ink-muted">
            Compartilhe o link abaixo: seus clientes agendam sozinhos, a qualquer hora.
          </p>
        </div>
      </div>

      {!emailVerified ? <ResendVerification email={userEmail} /> : null}

      <section
        aria-labelledby="link-title"
        className="flex flex-col gap-4 rounded-panel border border-line bg-surface p-5 sm:p-6"
      >
        <h2 id="link-title" className="text-sm font-semibold text-ink-muted">
          Seu link de agendamento
        </h2>
        <p className="font-display text-xl font-semibold leading-snug break-all sm:text-2xl">
          {shown}
        </p>
        <div className="flex flex-col gap-2 sm:flex-row">
          <CopyButton text={url} label="Copiar link" toastMessage="Link copiado" variant="default" />
          <a
            href={url}
            target="_blank"
            rel="noopener noreferrer"
            className={`${buttonVariants({ variant: "outline" })} w-full sm:w-auto`}
          >
            <ExternalLink aria-hidden="true" />
            Abrir minha página
            <span className="sr-only"> (abre em nova aba)</span>
          </a>
        </div>
      </section>

      <section
        aria-labelledby="whatsapp-title"
        className="flex flex-col gap-3 rounded-panel border border-line bg-surface p-5 sm:p-6"
      >
        <div className="flex flex-col gap-1">
          <h2 id="whatsapp-title" className="text-base font-semibold">
            Texto para o perfil do WhatsApp
          </h2>
          <p className="text-sm leading-snug text-ink-muted">
            Cole na descrição ou no status do seu WhatsApp Business.
          </p>
        </div>
        <p className="rounded-field bg-canvas px-4 py-3 text-[0.9375rem] leading-snug break-words">
          {whatsappText}
        </p>
        <div>
          <CopyButton text={whatsappText} label="Copiar texto" toastMessage="Texto copiado" />
        </div>
      </section>

      {error ? <FormAlert>{error}</FormAlert> : null}

      <Button type="button" size="lg" disabled={pending} onClick={goToAgenda} className="w-full">
        {pending ? (
          <>
            <Loader2 className="animate-spin" aria-hidden="true" />
            Abrindo…
          </>
        ) : (
          "Ir para a agenda"
        )}
      </Button>
    </div>
  );
}
