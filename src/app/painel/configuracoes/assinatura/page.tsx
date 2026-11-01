import Link from "next/link";
import { getDb } from "@/db/client";
import { formatBRL } from "@/lib/format";
import { billingConfig } from "@/server/billing/mode";
import { getBillingOverview } from "@/server/billing/queries";
import { requirePanelRole } from "@/server/panel/roles";
import { cancelSubscriptionAction, changePlanAction, startCheckout, undoPlanChangeAction } from "./actions";

const statusLabel: Record<string, string> = { pending: "Pendente", approved: "Paga", paid: "Paga", rejected: "Não aprovada", cancelled: "Cancelada", canceled: "Cancelada", refunded: "Reembolsada" };
const button = "min-h-11 rounded-field bg-primary px-4 font-semibold text-white";

export default async function AssinaturaPage() {
  const { session, timezone } = await requirePanelRole(["owner"]);
  const { current, available, invoices, pendingCheckoutUrl, subscription, activeProfessionals } = await getBillingOverview(await getDb(), session.tenantId);
  const date = new Intl.DateTimeFormat("pt-BR", { dateStyle: "short", timeZone: timezone });
  const config = billingConfig();
  const live = config?.live === true;
  const canCheckout = Boolean(config) && !session.support && session.emailVerified && ["trial", "active", "past_due"].includes(current.status);
  const plan = available.find((item) => item.id === current.id);
  const subscribed = subscription?.providerStatus === "authorized";
  const cancelled = subscription?.providerStatus === "cancelled" || subscription?.providerStatus === "canceled";
  const scheduled = subscribed && subscription?.scheduledPlanId ? available.find((item) => item.id === subscription.scheduledPlanId) : undefined;
  const canChangePlan = !session.support && ["trial", "active", "past_due"].includes(current.status) && !(subscription && ["paused", "creating", "uncertain"].includes(subscription.providerStatus));
  const currentPlan = plan;
  return <div className="mx-auto flex w-full max-w-[720px] flex-col gap-6">
    <Link href="/painel/configuracoes" className="text-sm text-primary">‹ Configurações</Link>
    <h1 className="text-[1.75rem] font-semibold">Plano e faturas</h1>
    <section className="rounded-card border border-line bg-surface p-5">
      <h2 className="font-semibold">Plano atual: {current.name}</h2>
      {current.status === "trial" ? <p>Você está no período de teste.</p> : null}
      {current.status === "past_due" ? <p className="text-danger">Não conseguimos confirmar o pagamento. Regularize para continuar recebendo agendamentos.</p> : null}
      {subscribed ? <p className="mt-1 text-sm text-ink-muted">Assinatura ativa, cobrada todo mês no cartão pela Mercado Pago.</p> : null}
      {cancelled ? <p className="mt-1 text-sm text-ink-muted">Assinatura cancelada.{subscription?.accessUntil ? ` Seu acesso vai até ${date.format(subscription.accessUntil)}.` : ""}</p> : null}
    </section>
    <section className="rounded-card border border-line bg-surface p-5">
      <h2 className="font-semibold">Planos disponíveis</h2>
      <ul className="mt-3 space-y-3">{available.map((item) => <li key={item.id} className="border-t border-line pt-3">
        <p className="font-semibold">{item.name} · {formatBRL(item.priceCents)}/mês {current.id === item.id ? "· Atual" : ""}</p>
        <p className="text-sm text-ink-muted">{item.maxProfessionals === null ? "Profissionais ilimitados" : `Até ${item.maxProfessionals} profissionais`} · {item.monthlyMessages} mensagens por mês</p>
        {canChangePlan && current.id !== item.id ? (() => {
          const tooMany = item.maxProfessionals !== null && activeProfessionals > item.maxProfessionals;
          const lower = currentPlan ? item.priceCents < currentPlan.priceCents : false;
          return <form action={changePlanAction} className="mt-2">
            <input type="hidden" name="planId" value={item.id} />
            <button type="submit" disabled={tooMany} className="min-h-11 rounded-field border border-line px-4 text-sm font-semibold disabled:opacity-50">{lower ? "Mudar para este plano no próximo ciclo" : "Mudar para este plano"}</button>
            <p className="mt-1 text-xs text-ink-muted">{tooMany ? `Você tem ${activeProfessionals} profissionais ativos. Desative até caber em ${item.maxProfessionals} em Equipe.` : subscribed ? (lower ? "Você continua com o plano atual até o fim do período pago." : "Libera na hora; o novo valor entra na próxima cobrança.") : "Vale na hora; nada é cobrado agora."}</p>
          </form>;
        })() : null}
      </li>)}</ul>
      {scheduled ? <div className="mt-4 rounded-field border border-line p-3 text-sm"><p>Mudança para o plano <strong>{scheduled.name}</strong> marcada para o próximo ciclo.</p><form action={undoPlanChangeAction} className="mt-2"><button type="submit" className="min-h-11 text-primary underline">Desfazer</button></form></div> : null}
      {!live ? <p className="mt-3 text-sm text-ink-muted">A contratação estará disponível em breve.</p> : null}
      {!live && pendingCheckoutUrl ? <a className="mt-3 inline-block text-primary" href={pendingCheckoutUrl} target="_blank" rel="noopener noreferrer">Continuar assinatura de teste →</a> : null}
      {live && pendingCheckoutUrl && !subscribed ? <a className="mt-3 inline-block text-primary" href={pendingCheckoutUrl} rel="noopener noreferrer">Continuar a assinatura →</a> : null}
      {canCheckout && !pendingCheckoutUrl && !subscribed ? <form action={startCheckout} className="mt-4">
        <input type="hidden" name="planId" value={current.id} />
        <button type="submit" className={button}>{live ? `${cancelled ? "Assinar novamente" : "Assinar"} o plano ${current.name}${plan ? ` · ${formatBRL(plan.priceCents)}/mês` : ""}` : "Testar assinatura do plano atual"}</button>
        <p className="mt-2 text-sm text-ink-muted">{live ? "Cobrança mensal no cartão pela Mercado Pago. Você pode cancelar quando quiser e o acesso continua até o fim do período já pago." : "Somente ambiente de teste. Não altera seu plano nem ativa cobrança real."}</p>
      </form> : null}
      {subscribed && !session.support ? <details className="mt-4">
        <summary className="cursor-pointer text-sm text-ink-muted">Cancelar assinatura</summary>
        <form action={cancelSubscriptionAction} className="mt-3 space-y-2">
          <p className="text-sm">O acesso continua até o fim do período já pago. Não há reembolso do mês em andamento.</p>
          <button type="submit" className="min-h-11 rounded-field border border-danger px-4 font-semibold text-danger">Confirmar cancelamento</button>
        </form>
      </details> : null}
    </section>
    <section className="rounded-card border border-line bg-surface p-5">
      <h2 className="font-semibold">Faturas</h2>
      {invoices.length === 0 ? <p className="mt-2 text-sm text-ink-muted">Nenhuma fatura registrada.</p> : <ul className="mt-3 space-y-2">{invoices.map((invoice) => <li key={invoice.id} className="border-t border-line pt-2">
        {formatBRL(invoice.amountCents)} · {statusLabel[invoice.status] ?? "Em processamento"}{invoice.dueAt ? ` · Vencimento: ${date.format(invoice.dueAt)}` : ""}{invoice.paidAt ? ` · Pago: ${date.format(invoice.paidAt)}` : ""}
      </li>)}</ul>}
    </section>
  </div>;
}
