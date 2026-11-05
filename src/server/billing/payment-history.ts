/**
 * Uma lista só com todos os pagamentos do estabelecimento (cartão, Pix e boleto), com as mesmas
 * palavras para a mesma situação. Antes eram duas listas ("Faturas" e "Pagamentos por Pix e
 * boleto") com vocabulários diferentes.
 */

export type PaymentKind = "card" | "pix" | "boleto";
export type PaymentState = "paid" | "pending" | "refused" | "expired" | "canceled" | "refunded" | "disputed" | "processing";

export const PAYMENT_STATE_LABEL: Record<PaymentState, string> = {
  paid: "Pago",
  pending: "Aguardando pagamento",
  refused: "Recusado",
  expired: "Vencido",
  canceled: "Cancelado",
  refunded: "Reembolsado",
  disputed: "Contestado",
  processing: "Em confirmação",
};

export const PAYMENT_KIND_LABEL: Record<PaymentKind, string> = { card: "Cartão", pix: "Pix", boleto: "Boleto" };

export type HistoryRow = {
  id: string;
  kind: PaymentKind;
  amountCents: number;
  state: PaymentState;
  /** Data que ordena a lista e aparece na linha (pagamento, ou criação quando ainda não foi pago). */
  date: Date;
  /** `paid`: até quando o pagamento vale, se conhecido. */
  validUntil: Date | null;
  /** Vencimento (cartão). */
  dueAt: Date | null;
};

type InvoiceInput = { id: string; amountCents: number; status: string; dueAt: Date | null; paidAt: Date | null; createdAt: Date };
type ChargeInput = { id: string; method: string; status: string; amountCents: number; paidAt: Date | null; periodEnd: Date | null; createdAt: Date };

/** Situação de uma fatura do cartão (vocabulário da Mercado Pago). */
export function cardState(status: string): PaymentState {
  switch (status) {
    case "approved":
    case "paid":
      return "paid";
    case "rejected":
      return "refused";
    case "pending":
    case "in_process":
      return "pending";
    case "cancelled":
    case "canceled":
      return "canceled";
    case "refunded":
      return "refunded";
    case "charged_back":
      return "disputed";
    default:
      return "processing";
  }
}

/** Situação de um Pix ou boleto (`billing_charges.status`; `cancelled` ali é o pagamento recusado). */
export function chargeState(status: string): PaymentState {
  switch (status) {
    case "approved":
      return "paid";
    case "pending":
      return "pending";
    case "expired":
      return "expired";
    case "cancelled":
      return "refused";
    case "refunded":
      return "refunded";
    case "charged_back":
      return "disputed";
    default:
      return "processing";
  }
}

export function buildPaymentHistory(invoices: InvoiceInput[], charges: ChargeInput[]): HistoryRow[] {
  const rows: HistoryRow[] = [
    ...invoices.map((invoice): HistoryRow => ({
      id: `card:${invoice.id}`,
      kind: "card",
      amountCents: invoice.amountCents,
      state: cardState(invoice.status),
      date: invoice.paidAt ?? invoice.createdAt,
      validUntil: null,
      dueAt: invoice.dueAt,
    })),
    ...charges
      .filter((charge) => charge.method === "pix" || charge.method === "boleto")
      .map((charge): HistoryRow => ({
        id: `${charge.method}:${charge.id}`,
        kind: charge.method as PaymentKind,
        amountCents: charge.amountCents,
        state: chargeState(charge.status),
        date: charge.paidAt ?? charge.createdAt,
        validUntil: charge.periodEnd,
        dueAt: null,
      })),
  ];
  return rows.sort((a, b) => b.date.getTime() - a.date.getTime() || a.id.localeCompare(b.id));
}
