/**
 * O que a tela "Plano e faturas" diz sobre a situação do plano, calculado num lugar só. Antes
 * cada aviso decidia por conta própria (um olhava a assinatura no cartão, outro o Pix), e a tela
 * chegava a dizer "pagamento recusado" em cima e "pago" embaixo. Aqui o pagamento em vigor
 * (Pix, boleto ou cartão ativo) sempre vence um cartão recusado que ficou no passado.
 */

export type SummaryTone = "ok" | "warn" | "info" | "muted";

export type PlanSummaryInput = {
  /** Situação do estabelecimento (`tenants.status`). */
  tenantStatus: string;
  /** Situação da assinatura no cartão mais recente (`authorized`, `cancelled`...), ou `null`. */
  subscriptionStatus: string | null;
  /** Fim do período pago de uma assinatura cancelada, se houver. */
  subscriptionAccessUntil: Date | null;
  /** Até quando o plano está pago por Pix ou boleto (`tenants.paid_until`). */
  paidUntil: Date | null;
  /** Alguma fatura do cartão foi recusada / alguma foi paga. */
  cardRejected: boolean;
  cardPaid: boolean;
  now: Date;
  /** Formata uma data para o texto ("04/11/2026"). */
  formatDate: (date: Date) => string;
};

export type PlanSummary = {
  badge: { text: string; tone: SummaryTone } | null;
  notices: Array<{ key: string; tone: SummaryTone; text: string }>;
  /** O plano está pago por Pix ou boleto e ainda vale. */
  paidActive: boolean;
  /** Existe assinatura no cartão ativa. */
  subscribed: boolean;
};

export function summarizePlan(input: PlanSummaryInput): PlanSummary {
  const subscribed = input.subscriptionStatus === "authorized";
  const cancelled = input.subscriptionStatus === "cancelled" || input.subscriptionStatus === "canceled";
  const paidByCharge = input.paidUntil !== null && !subscribed;
  const paidActive = paidByCharge && input.paidUntil!.getTime() > input.now.getTime();
  // A tentativa de assinar no cartão que não passou: cancelada, sem nada pago e sem outro pagamento em vigor.
  const refused = cancelled && !input.subscriptionAccessUntil && !paidActive && input.cardRejected && !input.cardPaid;

  const notices: PlanSummary["notices"] = [];
  if (input.tenantStatus === "trial" && !paidActive) {
    notices.push({ key: "trial", tone: "info", text: "Você está no período de teste. Assine quando quiser para continuar depois dele." });
  }
  if (input.tenantStatus === "past_due" && !paidActive) {
    notices.push({ key: "past-due", tone: "warn", text: "Não conseguimos confirmar o pagamento. Regularize para continuar recebendo agendamentos." });
  }
  if (subscribed) notices.push({ key: "card", tone: "muted", text: "Cobrada todo mês no cartão pela Mercado Pago." });
  if (paidByCharge && input.paidUntil) {
    notices.push({ key: "paid", tone: "ok", text: `Pago por Pix ou boleto até ${input.formatDate(input.paidUntil)}.` });
  }
  if (refused) {
    notices.push({ key: "refused", tone: "warn", text: "O pagamento no cartão não foi aprovado e o Mercado Pago encerrou essa tentativa. Você pode assinar de novo logo abaixo, de preferência com outro cartão, ou pagar por Pix." });
  }
  if (cancelled && !refused && !paidActive) {
    notices.push({ key: "cancelled", tone: "muted", text: `Assinatura cancelada.${input.subscriptionAccessUntil ? ` Seu acesso vai até ${input.formatDate(input.subscriptionAccessUntil)}.` : ""}` });
  }

  const badge: PlanSummary["badge"] = paidActive ? { text: "Plano pago", tone: "ok" }
    : input.tenantStatus === "trial" ? { text: "Período de teste", tone: "info" }
    : input.tenantStatus === "past_due" ? { text: "Pagamento pendente", tone: "warn" }
    : refused ? { text: "Pagamento recusado", tone: "warn" }
    : cancelled ? { text: "Cancelada", tone: "muted" }
    : subscribed ? { text: "Assinatura ativa", tone: "ok" }
    : null;

  return { badge, notices, paidActive, subscribed };
}
