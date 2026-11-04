import Link from "next/link";
import { eq } from "drizzle-orm";
import { getDb } from "@/db/client";
import { users } from "@/db/schema";
import { ChargePanel, type OpenCharge } from "@/components/settings/charge-panel";
import { formatBRL } from "@/lib/format";
import { refreshOpenCharge } from "@/server/billing/charges";
import { billingConfig } from "@/server/billing/mode";
import { getBillingOverview } from "@/server/billing/queries";
import { refreshPendingSubscriptions } from "@/server/billing/refresh-pending";
import { requirePanelRole } from "@/server/panel/roles";
import { cancelSubscriptionAction, changePlanAction, startCheckout, undoPlanChangeAction } from "./actions";

const statusLabel: Record<string, string> = { pending: "Pendente", approved: "Paga", paid: "Paga", rejected: "Não aprovada", cancelled: "Cancelada", canceled: "Cancelada", refunded: "Reembolsada" };
const chargeLabel: Record<string, string> = { pending: "Aguardando pagamento", approved: "Pago", expired: "Vencido", cancelled: "Não aprovado", refunded: "Reembolsado", charged_back: "Contestado", uncertain: "Em confirmação", creating: "Gerando" };
const primaryButton = "flex min-h-12 w-full items-center justify-center rounded-field bg-primary px-5 text-center font-semibold text-primary-foreground shadow-sm transition-opacity hover:opacity-90";
const secondaryButton = "flex min-h-11 w-full items-center justify-center rounded-field border border-line bg-canvas px-4 text-center text-sm font-semibold transition-colors hover:bg-primary-soft disabled:opacity-50";
const card = "flex flex-col gap-4 rounded-panel border border-line bg-surface p-5 sm:p-6";
const badgeBase = "inline-flex shrink-0 rounded-full px-2.5 py-1 text-xs font-semibold whitespace-nowrap";
const chip = "inline-flex items-center rounded-full bg-canvas px-2.5 py-1 text-[0.8125rem] text-ink-muted";
const invoiceBadge: Record<string, string> = {
  approved: "bg-[#E8F7EF] text-[#0B7A44] dark:bg-[#12301f] dark:text-[#3dd68c]",
  paid: "bg-[#E8F7EF] text-[#0B7A44] dark:bg-[#12301f] dark:text-[#3dd68c]",
  rejected: "bg-[#FFF4ED] text-[#9A3412] dark:bg-danger-soft dark:text-[#fb923c]",
};

export default async function AssinaturaPage() {
  const { session, timezone } = await requirePanelRole(["owner"]);
  const db = await getDb();
  const config = billingConfig();
  // Link de pagamento em aberto: confere na Mercado Pago se ele ainda vale. Depois de um pagamento
  // recusado ela cancela a assinatura, e o link passa a mostrar "Este plano não está disponível".
  if (config) {
    try {
      await refreshPendingSubscriptions(db, config, { tenantId: session.tenantId, limit: 5 });
    } catch {
      // Sem resposta da Mercado Pago a tela abre com o que já se sabe.
    }
    // Pix ou boleto em aberto: confere o pagamento agora, sem esperar o aviso nem o relógio do servidor.
    if (config.live) await refreshOpenCharge(db, session.tenantId, { accessToken: config.accessToken, collectorId: config.collectorId, liveMode: true });
  }
  const { current, available, invoices, pendingCheckoutUrl, subscription, activeProfessionals, charges, paidUntil, paidActive: paidNow, justPaid } = await getBillingOverview(db, session.tenantId);
  const [loginUser] = await db.select({ email: users.email }).from(users).where(eq(users.id, session.userId)).limit(1);
  const date = new Intl.DateTimeFormat("pt-BR", { dateStyle: "short", timeZone: timezone });
  const live = config?.live === true;
  const canCheckout = Boolean(config) && !session.support && session.emailVerified && ["trial", "active", "past_due"].includes(current.status);
  const plan = available.find((item) => item.id === current.id);
  const subscribed = subscription?.providerStatus === "authorized";
  const cancelled = subscription?.providerStatus === "cancelled" || subscription?.providerStatus === "canceled";
  const paidByCharge = Boolean(paidUntil) && !subscribed;
  const paidActive = paidByCharge && paidNow;
  // Cancelada sem nada pago e com cobrança recusada: foi a tentativa de assinar que não passou.
  const refused = cancelled && !subscription?.accessUntil && !paidActive && invoices.some((invoice) => invoice.status === "rejected") && !invoices.some((invoice) => invoice.status === "approved" || invoice.status === "paid");
  const scheduled = subscribed && subscription?.scheduledPlanId ? available.find((item) => item.id === subscription.scheduledPlanId) : undefined;
  const dayText = new Intl.DateTimeFormat("pt-BR", { dateStyle: "short", timeZone: timezone });
  const openRow = charges.find((item) => ["pending", "uncertain", "creating"].includes(item.status));
  const openCharge: OpenCharge | null = openRow && openRow.status === "pending" && (openRow.method === "pix" || openRow.method === "boleto")
    ? { id: openRow.id, method: openRow.method, amountLabel: formatBRL(openRow.amountCents), qrCode: openRow.qrCode, qrCodeBase64: openRow.qrCodeBase64, ticketUrl: openRow.ticketUrl, barcode: openRow.barcode, validity: openRow.expiresAt ? `vale até ${dayText.format(openRow.expiresAt)}` : null }
    : null;
  const canCharge = live && canCheckout && !subscribed && !pendingCheckoutUrl && !openRow && !(subscription && ["creating", "uncertain", "pending", "paused"].includes(subscription.providerStatus));
  const canChangePlan = !session.support && ["trial", "active", "past_due"].includes(current.status) && !(subscription && ["paused", "creating", "uncertain"].includes(subscription.providerStatus));
  const currentPlan = plan;
  const statusBadge = paidActive ? { text: "Plano pago", tone: "bg-[#E8F7EF] text-[#0B7A44] dark:bg-[#12301f] dark:text-[#3dd68c]" }
    : current.status === "trial" ? { text: "Período de teste", tone: "bg-primary-soft text-primary" }
    : current.status === "past_due" ? { text: "Pagamento pendente", tone: "bg-[#FFF4ED] text-[#9A3412] dark:bg-danger-soft dark:text-[#fb923c]" }
    : refused ? { text: "Pagamento recusado", tone: "bg-[#FFF4ED] text-[#9A3412] dark:bg-danger-soft dark:text-[#fb923c]" }
    : cancelled ? { text: "Cancelada", tone: "bg-line text-ink-muted" }
    : subscribed ? { text: "Assinatura ativa", tone: "bg-[#E8F7EF] text-[#0B7A44] dark:bg-[#12301f] dark:text-[#3dd68c]" }
    : null;
  return <div className="mx-auto flex w-full max-w-[720px] flex-col gap-6">
    <div className="flex flex-col gap-2">
      <Link href="/painel/configuracoes" className="text-sm text-primary">‹ Configurações</Link>
      <h1 className="text-[1.75rem] font-semibold">Plano e faturas</h1>
    </div>

    <section aria-labelledby="plano-atual" className={card}>
      <header className="flex items-start justify-between gap-3">
        <div className="flex flex-col gap-0.5">
          <p className="m-0 text-sm text-ink-muted">Seu plano</p>
          <h2 id="plano-atual" className="text-2xl font-semibold">{current.name}</h2>
        </div>
        {statusBadge ? <span className={`${badgeBase} ${statusBadge.tone}`}>{statusBadge.text}</span> : null}
      </header>
      {plan ? <p className="m-0 text-ink-muted"><span className="text-xl font-semibold text-foreground">{formatBRL(plan.priceCents)}</span>/mês</p> : null}
      {current.status === "trial" && !paidActive ? <p className="m-0 text-sm text-ink-muted">Você está no período de teste. Assine quando quiser para continuar depois dele.</p> : null}
      {current.status === "past_due" ? <p className="m-0 text-sm text-danger">Não conseguimos confirmar o pagamento. Regularize para continuar recebendo agendamentos.</p> : null}
      {subscribed ? <p className="m-0 text-sm text-ink-muted">Cobrada todo mês no cartão pela Mercado Pago.</p> : null}
      {justPaid && paidUntil ? <p role="status" className="m-0 rounded-field bg-[#E8F7EF] p-3 text-sm font-semibold text-[#0B7A44] dark:bg-[#12301f] dark:text-[#3dd68c]">Pagamento confirmado! Seu plano está pago até {date.format(paidUntil)}.</p> : null}
      {paidByCharge && paidUntil && !justPaid ? <p className="m-0 text-sm text-ink-muted">Pago por Pix ou boleto até <strong className="text-foreground">{date.format(paidUntil)}</strong>.</p> : null}
      {refused ? <p role="status" className="m-0 rounded-field bg-[#FFF4ED] p-3 text-sm text-[#9A3412] dark:bg-danger-soft dark:text-[#fb923c]">O pagamento não foi aprovado e o Mercado Pago encerrou essa tentativa. Você pode assinar de novo logo abaixo, de preferência com outro cartão.</p> : null}
      {cancelled && !refused && !paidActive ? <p className="m-0 text-sm text-ink-muted">Assinatura cancelada.{subscription?.accessUntil ? ` Seu acesso vai até ${date.format(subscription.accessUntil)}.` : ""}</p> : null}
    </section>

    <section aria-labelledby="planos" className="flex flex-col gap-3">
      <h2 id="planos" className="text-xl font-semibold">Planos disponíveis</h2>
      <ul className="m-0 flex list-none flex-col gap-3 p-0">{available.map((item) => {
        const isCurrent = current.id === item.id;
        return <li key={item.id} className={`flex flex-col gap-3 rounded-panel border bg-surface p-5 ${isCurrent ? "border-primary bg-primary-soft/40" : "border-line"}`}>
          <div className="flex items-start justify-between gap-3">
            <div className="flex flex-col gap-0.5">
              <h3 className="text-lg font-semibold">{item.name}</h3>
              <p className="m-0 text-ink-muted"><span className="text-xl font-semibold text-foreground">{formatBRL(item.priceCents)}</span>/mês</p>
            </div>
            {isCurrent ? <span className={`${badgeBase} bg-primary text-primary-foreground`}>Plano atual</span> : null}
          </div>
          <div className="flex flex-wrap gap-2">
            <span className={chip}>{item.maxProfessionals === null ? "Profissionais ilimitados" : `Até ${item.maxProfessionals} profissionais`}</span>
            <span className={chip}>{item.monthlyMessages} mensagens por mês</span>
          </div>
          {canChangePlan && !isCurrent ? (() => {
            const tooMany = item.maxProfessionals !== null && activeProfessionals > item.maxProfessionals;
            const lower = currentPlan ? item.priceCents < currentPlan.priceCents : false;
            return <form action={changePlanAction} className="flex flex-col gap-1.5">
              <input type="hidden" name="planId" value={item.id} />
              <button type="submit" disabled={tooMany} className={secondaryButton}>{lower ? "Mudar para este plano no próximo ciclo" : "Mudar para este plano"}</button>
              <p className="m-0 text-xs text-ink-muted">{tooMany ? `Você tem ${activeProfessionals} profissionais ativos. Desative até caber em ${item.maxProfessionals} em Equipe.` : subscribed ? (lower ? "Você continua com o plano atual até o fim do período pago." : "Libera na hora; o novo valor entra na próxima cobrança.") : "Vale na hora; nada é cobrado agora."}</p>
            </form>;
          })() : null}
        </li>;
      })}</ul>
      {scheduled ? <div className="rounded-field border border-line bg-surface p-4 text-sm"><p className="m-0">Mudança para o plano <strong>{scheduled.name}</strong> marcada para o próximo ciclo.</p><form action={undoPlanChangeAction} className="mt-2"><button type="submit" className="min-h-11 text-primary underline">Desfazer</button></form></div> : null}
    </section>

    <section aria-labelledby="assinar" className={card}>
      <h2 id="assinar" className="text-xl font-semibold">Assinatura</h2>
      {!live ? <p className="m-0 text-sm text-ink-muted">A contratação estará disponível em breve.</p> : null}
      {!live && pendingCheckoutUrl ? <a className={primaryButton} href={pendingCheckoutUrl} target="_blank" rel="noopener noreferrer">Continuar assinatura de teste →</a> : null}
      {live && pendingCheckoutUrl && !subscribed ? <>
        <p className="m-0 text-sm text-ink-muted">Sua assinatura está começada. Falta concluir o pagamento no cartão.</p>
        <a className={primaryButton} href={pendingCheckoutUrl} rel="noopener noreferrer">Continuar a assinatura →</a>
      </> : null}
      {canCheckout && !pendingCheckoutUrl && !subscribed ? <form action={startCheckout} className="flex flex-col gap-2">
        <input type="hidden" name="planId" value={current.id} />
        <label className="flex flex-col gap-1.5 text-sm font-medium">
          E-mail da conta Mercado Pago
          <input type="email" name="payerEmail" required defaultValue={loginUser?.email ?? ""} autoComplete="email" inputMode="email" maxLength={254} className="min-h-11 rounded-field border border-line bg-canvas px-3 text-base font-normal" />
          <span className="text-xs font-normal text-ink-muted">Use o e-mail da conta com que você paga no Mercado Pago. Pode ser diferente do e-mail de login. A assinatura fica ligada ao seu estabelecimento pelo código dela, não pelo e-mail.</span>
        </label>
        <button type="submit" className={primaryButton}>{live ? `${cancelled ? "Assinar novamente" : "Assinar"} o plano ${current.name}${plan ? ` · ${formatBRL(plan.priceCents)}/mês` : ""}` : "Testar assinatura do plano atual"}</button>
        <p className="m-0 text-sm text-ink-muted">{live ? "Cobrança mensal no cartão pela Mercado Pago. Você pode cancelar quando quiser e o acesso continua até o fim do período já pago." : "Somente ambiente de teste. Não altera seu plano nem ativa cobrança real."}</p>
      </form> : null}
      {subscribed ? <p className="m-0 text-sm text-ink-muted">Sua assinatura está ativa. Para trocar de plano, use os cartões acima.</p> : null}
      {subscribed && !session.support ? <details>
        <summary className="cursor-pointer text-sm text-ink-muted">Cancelar assinatura</summary>
        <form action={cancelSubscriptionAction} className="mt-3 flex flex-col gap-2">
          <p className="m-0 text-sm">O acesso continua até o fim do período já pago. Não há reembolso do mês em andamento.</p>
          <button type="submit" className="min-h-11 rounded-field border border-danger px-4 font-semibold text-danger">Confirmar cancelamento</button>
        </form>
      </details> : null}
    </section>

    {live && (openCharge || canCharge) ? <section aria-labelledby="pix-boleto" className={card}>
      <h2 id="pix-boleto" className="text-xl font-semibold">Pagar por Pix ou boleto</h2>
      {openRow && !openCharge ? <p className="m-0 text-sm text-ink-muted">Estamos confirmando o pagamento anterior. Em alguns minutos você poderá gerar outro, se precisar.</p> : null}
      <ChargePanel open={openCharge} canCreate={canCharge} priceLabel={plan ? formatBRL(plan.priceCents) : ""} />
    </section> : null}

    {charges.length > 0 ? <section aria-labelledby="pagamentos" className={card}>
      <h2 id="pagamentos" className="text-xl font-semibold">Pagamentos por Pix e boleto</h2>
      <ul className="m-0 flex list-none flex-col p-0">{charges.map((charge) => <li key={charge.id} className="flex items-start justify-between gap-3 border-t border-line py-3 first:border-t-0 first:pt-0">
        <div className="flex flex-col gap-0.5">
          <span className="font-semibold">{formatBRL(charge.amountCents)} · {charge.method === "pix" ? "Pix" : "Boleto"}</span>
          <span className="text-sm text-ink-muted">{charge.paidAt ? `Pago em ${date.format(charge.paidAt)}${charge.periodEnd ? ` · vale até ${date.format(charge.periodEnd)}` : ""}` : `Gerado em ${date.format(charge.createdAt)}`}</span>
        </div>
        <span className={`${badgeBase} ${charge.status === "approved" ? invoiceBadge.approved : charge.status === "pending" ? "bg-primary-soft text-primary" : "bg-line text-ink-muted"}`}>{chargeLabel[charge.status] ?? "Em processamento"}</span>
      </li>)}</ul>
    </section> : null}

    <section aria-labelledby="faturas" className={card}>
      <h2 id="faturas" className="text-xl font-semibold">Faturas</h2>
      {invoices.length === 0 ? <p className="m-0 text-sm text-ink-muted">Nenhuma fatura registrada.</p> : <ul className="m-0 flex list-none flex-col p-0">{invoices.map((invoice) => <li key={invoice.id} className="flex items-start justify-between gap-3 border-t border-line py-3 first:border-t-0 first:pt-0">
        <div className="flex flex-col gap-0.5">
          <span className="font-semibold">{formatBRL(invoice.amountCents)}</span>
          <span className="text-sm text-ink-muted">{invoice.dueAt ? `Vencimento: ${date.format(invoice.dueAt)}` : ""}{invoice.dueAt && invoice.paidAt ? " · " : ""}{invoice.paidAt ? `Pago: ${date.format(invoice.paidAt)}` : ""}</span>
        </div>
        <span className={`${badgeBase} ${invoiceBadge[invoice.status] ?? "bg-line text-ink-muted"}`}>{statusLabel[invoice.status] ?? "Em processamento"}</span>
      </li>)}</ul>}
    </section>
  </div>;
}
