import { CalendarDays } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { getDb } from "@/db/client";
import { googleCalendarEnabled } from "@/server/calendar/config";
import { connectionEligibility, getConnection } from "@/server/calendar/connections";
import { requireOnboarded } from "@/server/panel/onboarding-gate";
import { disconnectCalendarAction, toggleCalendarAction } from "./actions";

export const metadata: Metadata = { title: "Integrações" };

const MESSAGES: Record<string, { tone: "ok" | "warn"; text: string }> = {
  conectado: { tone: "ok", text: "Conta Google conectada. Os agendamentos vão aparecer na agenda “Eneven Agenda” do seu Google Agenda em alguns minutos." },
  cancelado: { tone: "warn", text: "Conexão cancelada. Nada foi alterado." },
  sem_permissao: { tone: "warn", text: "Para sincronizar, o Google precisa da permissão de agenda marcada. Tente de novo e deixe a opção marcada." },
  indisponivel: { tone: "warn", text: "Seu acesso não está ligado a um profissional, então não há agenda para enviar. Peça ao proprietário para ligar seu acesso ao seu cadastro em Equipe." },
  erro: { tone: "warn", text: "Não foi possível conectar agora. Tente novamente em instantes." },
};

const button = "flex min-h-11 w-full items-center justify-center rounded-field px-4 text-center font-semibold sm:w-auto";
const primary = `${button} bg-primary text-primary-foreground`;
const secondary = `${button} border border-line bg-canvas`;
const disabledButton = `${button} cursor-not-allowed border border-line bg-canvas text-ink-muted opacity-70`;

export default async function IntegracoesPage({ searchParams }: PageProps<"/painel/integracoes">) {
  const { session } = await requireOnboarded();
  const { google } = await searchParams;
  const flag = typeof google === "string" ? MESSAGES[google] : undefined;
  const owner = session.role === "owner";
  const enabled = googleCalendarEnabled();
  const db = await getDb();
  const connection = session.tenantId ? await getConnection(db, session.tenantId, session.userId) : null;
  const eligibility = session.tenantId ? await connectionEligibility(db, session.tenantId, session.userId) : null;
  const scopeText = eligibility?.eligible && eligibility.scope === "own"
    ? "Você recebe só os seus agendamentos."
    : "Você recebe os agendamentos de todos os profissionais, com o nome de quem atende.";
  const when = (date: Date | null) => (date ? new Intl.DateTimeFormat("pt-BR", { dateStyle: "short", timeStyle: "short", timeZone: "America/Sao_Paulo" }).format(date) : null);

  return (
    <div className="mx-auto flex w-full max-w-[720px] flex-col gap-6">
      <div className="flex flex-col gap-2">
        <Link href={owner ? "/painel/configuracoes" : "/painel/mais"} className="text-sm text-primary">‹ {owner ? "Configurações" : "Mais"}</Link>
        <h1 className="text-[1.75rem] font-semibold">Integrações</h1>
        <p className="m-0 text-ink-muted">Conecte o Eneven Agenda a outros serviços.</p>
      </div>

      {flag ? <p role="status" className={`m-0 rounded-field border-l-[3px] px-4 py-3 text-sm ${flag.tone === "ok" ? "border-success bg-success/10" : "border-danger bg-danger-soft"}`}>{flag.text}</p> : null}

      <section aria-labelledby="gcal-title" className="flex flex-col gap-4 rounded-panel border border-line bg-surface p-5 sm:p-6">
        <header className="flex items-start gap-3">
          <span className="grid size-11 shrink-0 place-items-center rounded-xl bg-primary-soft text-primary" aria-hidden="true"><CalendarDays className="size-6" /></span>
          <div className="flex min-w-0 flex-1 flex-col gap-1">
            <div className="flex flex-wrap items-center gap-2">
              <h2 id="gcal-title" className="text-xl font-semibold">Google Agenda</h2>
              {!enabled ? <span className="rounded-full bg-primary-soft px-2.5 py-0.5 text-xs font-semibold text-primary">Em breve</span> : connection ? <span className={`rounded-full px-2.5 py-0.5 text-xs font-semibold ${connection.status !== "active" ? "bg-danger-soft text-danger" : connection.enabled ? "bg-success/15 text-success" : "bg-line text-ink-muted"}`}>{connection.status !== "active" ? "Precisa reconectar" : connection.enabled ? "Ativado" : "Desativado"}</span> : null}
            </div>
            <p className="m-0 text-sm leading-snug text-ink-muted">Cada agendamento criado, remarcado ou cancelado aparece também numa agenda chamada “Eneven Agenda” dentro do seu Google Agenda. Só o Eneven Agenda escreve nela: seus outros eventos não são lidos nem alterados, e o cliente não recebe convite.</p>
          </div>
        </header>

        {!enabled ? (
          <>
            <button type="button" disabled aria-disabled="true" className={disabledButton}>Ativar</button>
            <p className="m-0 text-sm text-ink-muted">Estamos finalizando a aprovação do Google. Assim que estiver pronto, você conecta sua conta aqui.</p>
          </>
        ) : session.support ? (
          <p className="m-0 text-sm text-ink-muted">Indisponível no modo suporte.</p>
        ) : eligibility && !eligibility.eligible ? (
          <p className="m-0 text-sm text-ink-muted">Seu acesso não está ligado a um profissional, então não há agenda para enviar. Peça ao proprietário para ligar seu acesso ao seu cadastro em Equipe.</p>
        ) : !connection ? (
          <>
            <p className="m-0 text-sm text-ink-muted">{scopeText}</p>
            {/* Link comum de propósito: é uma rota de servidor que redireciona ao Google (precisa de navegação completa). */}
            {/* eslint-disable-next-line @next/next/no-html-link-for-pages */}
            <a href="/api/google-agenda/conectar" className={primary}>Conectar conta Google</a>
            <p className="m-0 text-xs text-ink-muted">O Google vai pedir permissão. O Eneven Agenda manda para o Google o nome do cliente, os serviços, o profissional, o valor e o horário; telefone e observações não vão.</p>
          </>
        ) : (
          <>
            <dl className="m-0 grid gap-1 text-sm">
              <div className="flex flex-wrap gap-x-2"><dt className="text-ink-muted">Conta:</dt><dd className="m-0 font-medium">{connection.googleEmail}</dd></div>
              <div className="flex flex-wrap gap-x-2"><dt className="text-ink-muted">Agenda:</dt><dd className="m-0 font-medium">{connection.calendarName}</dd></div>
              {when(connection.lastSyncedAt) ? <div className="flex flex-wrap gap-x-2"><dt className="text-ink-muted">Última sincronização:</dt><dd className="m-0">{when(connection.lastSyncedAt)}</dd></div> : null}
            </dl>
            <p className="m-0 text-sm text-ink-muted">{scopeText}</p>
            {connection.status !== "active" ? <p role="alert" className="m-0 rounded-field border-l-[3px] border-danger bg-danger-soft px-4 py-3 text-sm">{connection.lastError ?? "Precisa reconectar a conta Google."}</p> : connection.lastError ? <p role="status" className="m-0 text-sm text-ink-muted">{connection.lastError}</p> : null}
            <div className="flex flex-col gap-2 sm:flex-row sm:flex-wrap">
              {/* eslint-disable-next-line @next/next/no-html-link-for-pages */}
              {connection.status !== "active" ? <a href="/api/google-agenda/conectar" className={primary}>Reconectar conta Google</a> : (
                <form action={toggleCalendarAction}>
                  <input type="hidden" name="enabled" value={connection.enabled ? "false" : "true"} />
                  <button type="submit" className={connection.enabled ? secondary : primary}>{connection.enabled ? "Desativar" : "Ativar"}</button>
                </form>
              )}
              <details className="sm:ml-auto">
                <summary className="min-h-11 cursor-pointer content-center text-sm text-ink-muted">Desconectar</summary>
                <form action={disconnectCalendarAction} className="mt-3 flex flex-col gap-2">
                  <p className="m-0 text-sm">Retira o acesso do Eneven Agenda à sua conta Google. Os eventos que já foram criados ficam na agenda “Eneven Agenda”; você pode apagá-la no Google Agenda.</p>
                  <button type="submit" className="min-h-11 rounded-field border border-danger px-4 font-semibold text-danger">Confirmar desconexão</button>
                </form>
              </details>
            </div>
          </>
        )}
      </section>
    </div>
  );
}
