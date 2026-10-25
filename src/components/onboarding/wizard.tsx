"use client";

import { useRouter } from "next/navigation";
import { useRef, useState, useTransition } from "react";
import { saveProfessionalAction } from "@/app/painel/equipe/actions";
import { skipOnboardingAction } from "@/app/painel/comecar/actions";
import { BrandLogo } from "@/components/brand/logo";
import { ProgressThread } from "@/components/brand/progress-thread";
import { Button } from "@/components/ui/button";
import { useToast } from "@/components/ui/toast";
import type { WeeklyHours } from "@/lib/weekly-hours";
import { StepBusiness, type BusinessStepData } from "./step-business";
import { StepDone } from "./step-done";
import { StepHours } from "./step-hours";
import { StepServices } from "./step-services";
import { StepTeam } from "./step-team";
import type { WizardProfessional, WizardService } from "./types";

export type { WizardProfessional, WizardService } from "./types";

const STEPS = ["Seu estabelecimento", "Horário", "Serviços", "Equipe"];
const DONE = STEPS.length;

/**
 * "Primeiros passos": 4 etapas com o fio de progresso e a tela final. Cada
 * "Continuar" já grava no servidor, então "Voltar" e recarregar a página não
 * perdem nada. A etapa inicial vem do banco (`getOnboardingState`).
 */
export function OnboardingWizard({
  initialStep,
  slug,
  emailVerified,
  userEmail,
  tenant,
  hours: initialHours,
  services: initialServices,
  professionals: initialProfessionals,
}: {
  initialStep: 1 | 2 | 3 | 4;
  slug: string;
  emailVerified: boolean;
  userEmail: string;
  tenant: BusinessStepData;
  hours: WeeklyHours;
  services: WizardService[];
  professionals: WizardProfessional[];
}) {
  const router = useRouter();
  const toast = useToast();
  const [skipping, startSkip] = useTransition();
  const [step, setStep] = useState(initialStep - 1);
  const [services, setServices] = useState(initialServices);
  const [professionals, setProfessionals] = useState(initialProfessionals);
  // Horário de funcionamento já gravado: a equipe é criada e ajustada em cima dele.
  const [hours, setHours] = useState(initialHours);
  const savedHours = useRef(JSON.stringify(initialHours));

  const go = (next: number) => {
    setStep(next);
    window.scrollTo({ top: 0 });
    // Leitores de tela: o foco vai para o título da nova etapa (depois da renderização).
    requestAnimationFrame(() => {
      requestAnimationFrame(() => document.getElementById("step-title")?.focus({ preventScroll: true }));
    });
  };

  /**
   * Horário salvo na etapa 2: o expediente de quem já está na equipe acompanha o
   * novo horário de funcionamento (o servidor não aceita expediente fora dele).
   */
  const syncTeamHours = async (next: WeeklyHours): Promise<string | null> => {
    const serialized = JSON.stringify(next);
    if (serialized !== savedHours.current) {
      for (const person of professionals) {
        const result = await saveProfessionalAction({
          id: person.id,
          name: person.name,
          color: person.color ?? "#3E07D2",
          active: true,
          serviceIds: services.map((s) => s.id),
          hours: next,
        });
        if (!result.ok) {
          return result.fieldErrors?.hours ?? result.error ?? "Não foi possível ajustar a equipe.";
        }
      }
      savedHours.current = serialized;
      setHours(next);
    }
    go(2);
    return null;
  };

  const skip = () =>
    startSkip(async () => {
      const result = await skipOnboardingAction();
      if (!result.ok) {
        toast.show(result.error ?? "Não foi possível pular agora.", "error");
        return;
      }
      router.replace("/painel");
    });

  const finished = step === DONE;

  return (
    <div className="min-h-dvh bg-canvas">
      <header className="border-b border-line bg-surface">
        <div className="mx-auto flex h-14 w-full max-w-[640px] items-center justify-between gap-3 pl-4 pr-1 sm:px-6">
          <BrandLogo width={120} />
          {finished ? null : (
            <Button
              type="button"
              variant="ghost"
              disabled={skipping}
              onClick={skip}
              className="text-ink-muted"
            >
              Fazer depois
            </Button>
          )}
        </div>
      </header>

      <main className="mx-auto flex w-full max-w-[640px] flex-col gap-6 px-4 pb-16 pt-6 sm:px-6 sm:pt-8">
        {finished ? (
          <StepDone
            slug={slug}
            emailVerified={emailVerified}
            userEmail={userEmail}
            onFinish={() => router.replace("/painel")}
          />
        ) : (
          <>
            <ProgressThread steps={STEPS} current={step} label="Primeiros passos" />
            {step === 0 ? (
              <StepBusiness initial={tenant} onDone={() => go(1)} />
            ) : step === 1 ? (
              <StepHours initial={hours} onBack={() => go(0)} onSave={syncTeamHours} />
            ) : step === 2 ? (
              <StepServices
                services={services}
                professionals={professionals}
                onServicesChange={setServices}
                onBack={() => go(1)}
                onNext={() => go(3)}
              />
            ) : (
              <StepTeam
                professionals={professionals}
                services={services}
                hours={hours}
                onProfessionalsChange={setProfessionals}
                onBack={() => go(2)}
                onNext={() => go(DONE)}
              />
            )}
          </>
        )}
      </main>
    </div>
  );
}
