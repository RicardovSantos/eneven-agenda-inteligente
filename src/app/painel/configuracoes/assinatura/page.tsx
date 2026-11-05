import Link from "next/link";
import { eq } from "drizzle-orm";
import { getDb } from "@/db/client";
import { users } from "@/db/schema";
import { ChargePanel, type ConfirmedCharge, type OpenCharge } from "@/components/settings/charge-panel";
import { formatBRL } from "@/lib/format";
import { refreshOpenCharge } from "@/server/billing/charges";
import { GatewayUnavailableError, type Gateway } from "@/server/billing/gateways/types";
import { resolveGateway } from "@/server/billing/gateways/router";
import { billingConfig } from "@/server/billing/mode";
import { getStripe } from "@/server/billing/stripe/client";
import { refreshOpenStripeCharge } from "@/server/billing/stripe/charges";
import { stripeConfig } from "@/server/billing/stripe/config";
import { PAYMENT_KIND_LABEL, PAYMENT_STATE_LABEL, buildPaymentHistory, type PaymentState } from "@/server/billing/payment-history";
import { summarizePlan, type SummaryTone } from "@/server/billing/plan-summary";
import { getBillingOverview } from "@/server/billing/queries";
import { refreshPendingStripeSubscriptions, refreshPendingSubscriptions } from "@/server/billing/refresh-pending";
import { requirePanelRole } from "@/server/panel/roles";
import { cancelSubscriptionAction, changePlanAction, openCardPortalAction, startCheckout, undoPlanChangeAction } from "./actions";

const TONE_BADGE: Record<SummaryTone, string> = {
  ok: "bg-[#E8F7EF] text-[#0B7A44] dark:bg-[#12301f] dark:text-[#3dd68c]",
  warn: "bg-[#FFF4ED] text-[#9A3412] dark:bg-danger-soft dark:text-[#fb923c]",
  info: "bg-primary-soft text-primary",
  muted: "bg-line text-ink-muted",
};
const TONE_NOTICE: Record<SummaryTone, string> = {
  ok: "m-0 rounded-field bg-[#E8F7EF] p-3 text-sm font-medium text-[#0B7A44] dark:bg-[#12301f] dark:text-[#3dd68c]",
  warn: "m-0 rounded-field bg-[#FFF4ED] p-3 text-sm text-[#9A3412] dark:bg-danger-soft dark:text-[#fb923c]",
  info: "m-0 text-sm text-ink-muted",
  muted: "m-0 text-sm text-ink-muted",
};
const STATE_TONE: Record<PaymentState, SummaryTone> = { paid: "ok", refused: "warn", disputed: "warn", pending: "info", processing: "info", expired: "muted", canceled: "muted", refunded: "muted" };
const primaryButton = "flex min-h-12 w-full items-center justify-center rounded-field bg-primary px-5 text-center font-semibold text-primary-foreground shadow-sm transition-opacity hover:opacity-90";
const secondaryButton = "flex min-h-11 w-full items-center justify-center rounded-field border border-line bg-canvas px-4 text-center text-sm font-semibold transition-colors hover:bg-primary-soft disabled:opacity-50";
const card = "flex flex-col gap-4 rounded-panel border border-line bg-surface p-5 sm:p-6";
const badgeBase = "inline-flex shrink-0 rounded-full px-2.5 py-1 text-xs font-semibold whitespace-nowrap";
const chip = "inline-flex items-center rounded-full bg-canvas px-2.5 py-1 text-[0.8125rem] text-ink-muted";

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
  // Provedor do cartão para NOVAS contratações; uma assinatura que já existe segue no provedor dela.
  let cardGateway: Gateway | null = null;
  try {
    cardGateway = await resolveGateway(db, "card");
  } catch (error) {
    if (!(error instanceof GatewayUnavailableError)) throw error;
  }
  // Pix e boleto: cada forma tem o seu provedor padrão; só aparecem as que estão prontas agora.
  const chargeMethods: Array<"pix" | "boleto"> = [];
  for (const method of ["pix", "boleto"] as const) {
    try {
      await resolveGateway(db, method);
      chargeMethods.push(method);
    } catch (error) {
      if (!(error instanceof GatewayUnavailableError)) throw error;
    }
  }
  const stripe = stripeConfig();
  if (stripe) {
    try {
      await refreshPendingStripeSubscriptions(db, getStripe(stripe), { tenantId: session.tenantId, limit: 5 });
      await refreshOpenStripeCharge(db, session.tenantId, getStripe(stripe));
    } catch {
      // Sem resposta da Stripe a tela abre com o que já se sabe.
    }
  }
  const { current, available, invoices, pendingCheckoutUrl, subscription, activeProfessionals, charges, paidUntil, justPaid } = await getBillingOverview(db, session.tenantId);
  const [loginUser] = await db.select({ email: users.email }).from(users).where(eq(users.id, session.userId)).limit(1);
  const date = new Intl.DateTimeFormat("pt-BR", { dateStyle: "short", timeZone: timezone });
  const live = config?.live === true || (cardGateway === "stripe" && stripe?.live === true) || subscription?.provider === "stripe";
  const canCheckout = cardGateway !== null && !session.support && session.emailVerified && ["trial", "active", "past_due"].includes(current.status);
  const plan = available.find((item) => item.id === current.id);
  // Tudo o que o topo diz sobre o plano vem desta função, e o histórico lá embaixo é uma lista só:
  // o pagamento em vigor (Pix, boleto ou cartão) nunca convive com um aviso de "recusado" antigo.
  const summary = summarizePlan({
    tenantStatus: current.status,
    subscriptionStatus: subscription?.providerStatus ?? null,
    subscriptionAccessUntil: subscription?.accessUntil ?? null,
    paidUntil,
    cardRejected: invoices.some((invoice) => invoice.status === "rejected"),
    provider: subscription?.provider ?? null,
    cardPaid: invoices.some((invoice) => invoice.status === "approved" || invoice.status === "paid"),
    now: new Date(),
    formatDate: (value) => date.format(value),
  });
  const { subscribed } = summary;
  const cancelled = subscription?.providerStatus === "cancelled" || subscription?.providerStatus === "canceled";
  const history = buildPaymentHistory(invoices, charges);
  const scheduled = subscribed && subscription?.scheduledPlanId ? available.find((item) => item.id === subscription.scheduledPlanId) : undefined;
  const dayText = new Intl.DateTimeFormat("pt-BR", { dateStyle: "short", timeZone: timezone });
  const openRow = charges.find((item) => ["pending", "uncertain", "creating"].includes(item.status));
  const openCharge: OpenCharge | null = openRow && openRow.status === "pending" && (openRow.method === "pix" || openRow.method === "boleto")
    ? { id: openRow.id, method: openRow.method, amountLabel: formatBRL(openRow.amountCents), qrCode: openRow.qrCode, qrCodeBase64: openRow.qrCodeBase64, ticketUrl: openRow.ticketUrl, barcode: openRow.barcode, validity: openRow.expiresAt ? `vale até ${dayText.format(openRow.expiresAt)}` : null }
    : null;
  // Pago há menos de uma hora: o bloco de pagamento mostra a confirmação em vez de oferecer outro Pix.
  const lastCharge = charges[0];
  const confirmed: ConfirmedCharge | null = justPaid && !openRow && lastCharge && (lastCharge.method === "pix" || lastCharge.method === "boleto")
    ? { method: lastCharge.method, paidUntilLabel: paidUntil ? date.format(paidUntil) : null }
    : null;
  const canCharge = chargeMethods.length > 0 && canCheckout && !subscribed && !pendingCheckoutUrl && !openRow && !confirmed && !(subscription && ["creating", "uncertain", "pending", "paused"].includes(subscription.providerStatus));
  const canChangePlan = !session.support && ["trial", "active", "past_due"].includes(current.status) && !(subscription && ["paused", "creating", "uncertain"].includes(subscription.providerStatus));
  const currentPlan = plan;
  const statusBadge = summary.badge;
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
        {statusBadge ? <span className={`${badgeBase} ${TONE_BADGE[statusBadge.tone]}`}>{statusBadge.text}</span> : null}
      </header>
      {plan ? <p className="m-0 text-ink-muted"><span className="text-xl font-semibold text-foreground">{formatBRL(plan.priceCents)}</span>/mês</p> : null}
      {summary.notices.map((notice) => <p key={notice.key} role={notice.tone === "warn" ? "status" : undefined} className={TONE_NOTICE[notice.tone]}>{notice.text}</p>)}
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
        {cardGateway === "mercadopago" ? <label className="flex flex-col gap-1.5 text-sm font-medium">
          E-mail da conta Mercado Pago
          <input type="email" name="payerEmail" required defaultValue={loginUser?.email ?? ""} autoComplete="email" inputMode="email" maxLength={254} className="min-h-11 rounded-field border border-line bg-canvas px-3 text-base font-normal" />
          <span className="text-xs font-normal text-ink-muted">Use o e-mail da conta com que você paga no Mercado Pago. Pode ser diferente do e-mail de login. A assinatura fica ligada ao seu estabelecimento pelo código dela, não pelo e-mail.</span>
        </label> : null}
        <button type="submit" className={primaryButton}>{live ? `${cancelled ? "Assinar novamente" : "Assinar"} o plano ${current.name}${plan ? ` · ${formatBRL(plan.priceCents)}/mês` : ""}` : "Testar assinatura do plano atual"}</button>
        <p className="m-0 text-sm text-ink-muted">{live ? `Cobrança mensal no cartão ${cardGateway === "stripe" ? "pela Stripe" : "pela Mercado Pago"}. Você pode cancelar quando quiser e o acesso continua até o fim do período já pago.` : "Somente ambiente de teste. Não altera seu plano nem ativa cobrança real."}</p>
      </form> : null}
      {subscribed ? <p className="m-0 text-sm text-ink-muted">Sua assinatura está ativa. Para trocar de plano, use os cartões acima.</p> : null}
      {subscribed && !session.support && subscription?.provider === "stripe" ? <form action={openCardPortalAction}><button type="submit" className={secondaryButton}>Atualizar cartão e ver faturas</button></form> : null}
      {subscribed && !session.support ? <details>
        <summary className="cursor-pointer text-sm text-ink-muted">Cancelar assinatura</summary>
        <form action={cancelSubscriptionAction} className="mt-3 flex flex-col gap-2">
          <p className="m-0 text-sm">O acesso continua até o fim do período já pago. Não há reembolso do mês em andamento.</p>
          <button type="submit" className="min-h-11 rounded-field border border-danger px-4 font-semibold text-danger">Confirmar cancelamento</button>
        </form>
      </details> : null}
    </section>

    {(openCharge || canCharge || confirmed) ? <section aria-labelledby="pix-boleto" className={card}>
      <h2 id="pix-boleto" className="text-xl font-semibold">Pagar por Pix ou boleto</h2>
      {openRow && !openCharge ? <p className="m-0 text-sm text-ink-muted">Estamos confirmando o pagamento anterior. Em alguns minutos você poderá gerar outro, se precisar.</p> : null}
      <ChargePanel open={openCharge} methods={chargeMethods} canCreate={canCharge} confirmed={confirmed} priceLabel={plan ? formatBRL(plan.priceCents) : ""} />
    </section> : null}

    <section aria-labelledby="historico" className={card}>
      <h2 id="historico" className="text-xl font-semibold">Histórico de pagamentos</h2>
      {history.length === 0 ? <p className="m-0 text-sm text-ink-muted">Nenhum pagamento registrado.</p> : <ul className="m-0 flex list-none flex-col p-0">{history.map((row) => <li key={row.id} className="flex items-start justify-between gap-3 border-t border-line py-3 first:border-t-0 first:pt-0">
        <div className="flex flex-col gap-0.5">
          <span className="font-semibold">{formatBRL(row.amountCents)} · {PAYMENT_KIND_LABEL[row.kind]}</span>
          <span className="text-sm text-ink-muted">{row.state === "paid" ? `Pago em ${date.format(row.date)}${row.validUntil ? ` · vale até ${date.format(row.validUntil)}` : ""}` : row.dueAt ? `Vencimento: ${date.format(row.dueAt)}` : `Gerado em ${date.format(row.date)}`}</span>
        </div>
        <span className={`${badgeBase} ${TONE_BADGE[STATE_TONE[row.state]]}`}>{PAYMENT_STATE_LABEL[row.state]}</span>
      </li>)}</ul>}
    </section>
  </div>;
}
