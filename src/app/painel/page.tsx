import type { Metadata } from "next";
import { Button } from "@/components/ui/button";
import { formatDayMonth, trialDaysLeft } from "@/lib/trial";
import { getPanelData } from "@/server/panel/data";

export const metadata: Metadata = { title: "Agenda" };

export default async function PainelPage() {
  const data = await getPanelData();
  const firstName = data.userName.trim().split(/\s+/)[0] ?? data.userName;

  const isTrial = data.tenantStatus === "trial";
  const daysLeft = trialDaysLeft(data.trialEndsAt);

  return (
    <div className="flex min-h-[calc(100dvh-10rem)] flex-col gap-6 lg:min-h-[calc(100dvh-6rem)]">
      <div className="flex flex-col gap-3">
        {!data.session.emailVerified ? (
          <div
            role="status"
            className="flex flex-col gap-3 rounded-field border-l-[3px] border-danger bg-danger-soft px-4 py-3 sm:flex-row sm:items-center sm:justify-between"
          >
            <p className="text-sm leading-snug">
              Confirme seu e-mail para liberar seu link de agendamento. Enviamos para{" "}
              <strong className="font-semibold break-all">{data.userEmail}</strong>.
            </p>
            <Button variant="outline" disabled className="shrink-0">
              Reenviar e-mail
            </Button>
          </div>
        ) : null}

        {isTrial ? (
          <p className="rounded-field bg-primary-soft px-4 py-3 text-sm leading-snug text-primary">
            {daysLeft > 0 ? (
              <>
                Seu teste grátis termina em{" "}
                <strong className="font-semibold">
                  {daysLeft} {daysLeft === 1 ? "dia" : "dias"}
                </strong>{" "}
                ({formatDayMonth(data.trialEndsAt, data.timezone)}).
              </>
            ) : (
              <>Seu teste grátis terminou.</>
            )}
          </p>
        ) : null}
      </div>

      <div>
        <h1 className="text-[1.75rem] font-semibold">Olá, {firstName}</h1>
        <p className="text-ink-muted">{data.tenantName}</p>
      </div>

      <div className="flex flex-1 flex-col items-center justify-center gap-4 py-10 text-center">
        <div className="fio w-40" />
        <div className="flex flex-col gap-1">
          <p className="text-lg font-medium">
            Sua agenda está pronta para receber agendamentos.
          </p>
          <p className="text-ink-muted">
            Em breve: serviços, equipe e seu link de agendamento.
          </p>
        </div>
      </div>
    </div>
  );
}
