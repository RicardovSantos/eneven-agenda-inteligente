import { describe, expect, it } from "vitest";
import { summarizePlan, type PlanSummaryInput } from "@/server/billing/plan-summary";
import { buildPaymentHistory, cardState, chargeState } from "@/server/billing/payment-history";

const NOW = new Date("2030-06-10T12:00:00Z");
const day = (n: number) => new Date(NOW.getTime() + n * 86_400_000);
const base: PlanSummaryInput = {
  tenantStatus: "trial",
  subscriptionStatus: null,
  subscriptionAccessUntil: null,
  paidUntil: null,
  cardRejected: false,
  cardPaid: false,
  now: NOW,
  formatDate: (date) => date.toISOString().slice(0, 10),
};
const texts = (input: Partial<PlanSummaryInput>) => summarizePlan({ ...base, ...input }).notices.map((n) => n.key);

describe("resumo do plano: uma informação só", () => {
  it("em teste, sem pagar nada", () => {
    const summary = summarizePlan(base);
    expect(summary.badge).toEqual({ text: "Período de teste", tone: "info" });
    expect(summary.notices.map((n) => n.key)).toEqual(["trial"]);
  });

  it("cartão recusado e cancelado, nada pago: avisa a recusa (em teste a etiqueta segue 'Período de teste')", () => {
    const inTrial = summarizePlan({ ...base, subscriptionStatus: "cancelled", cardRejected: true });
    expect(inTrial.badge?.text).toBe("Período de teste");
    expect(inTrial.notices.map((n) => n.key)).toContain("refused");
    const active = summarizePlan({ ...base, tenantStatus: "active", subscriptionStatus: "cancelled", cardRejected: true });
    expect(active.badge).toEqual({ text: "Pagamento recusado", tone: "warn" });
    expect(active.notices.map((n) => n.key)).toEqual(["refused"]);
  });

  it("o caso real: cartão recusado e depois o Pix pago. Fala 'plano pago' e some o aviso de recusa", () => {
    const summary = summarizePlan({ ...base, tenantStatus: "active", subscriptionStatus: "cancelled", cardRejected: true, paidUntil: day(30) });
    expect(summary.badge).toEqual({ text: "Plano pago", tone: "ok" });
    expect(summary.paidActive).toBe(true);
    expect(summary.notices.map((n) => n.key)).toEqual(["paid"]);
    expect(summary.notices[0].text).toBe("Pago por Pix ou boleto até 2030-07-10.");
    // Nenhuma palavra de recusa nem de cancelamento convive com o plano pago.
    expect(JSON.stringify(summary)).not.toMatch(/recusad|não foi aprovado|cancelad/i);
  });

  it("pago por Pix durante o teste: não diz mais que está só no teste", () => {
    const summary = summarizePlan({ ...base, tenantStatus: "trial", paidUntil: day(30) });
    expect(summary.badge?.text).toBe("Plano pago");
    expect(summary.notices.map((n) => n.key)).toEqual(["paid"]);
  });

  it("Pix vencido (paidUntil no passado) e conta em atraso: volta a pedir o pagamento", () => {
    const summary = summarizePlan({ ...base, tenantStatus: "past_due", paidUntil: day(-2) });
    expect(summary.paidActive).toBe(false);
    expect(summary.badge?.text).toBe("Pagamento pendente");
    expect(summary.notices.map((n) => n.key)).toContain("past-due");
  });

  it("assinatura no cartão ativa", () => {
    const summary = summarizePlan({ ...base, tenantStatus: "active", subscriptionStatus: "authorized", cardPaid: true });
    expect(summary.badge).toEqual({ text: "Assinatura ativa", tone: "ok" });
    expect(summary.subscribed).toBe(true);
    expect(summary.notices.map((n) => n.key)).toEqual(["card"]);
  });

  it("cancelada com período pago a correr: mostra até quando vai o acesso", () => {
    const summary = summarizePlan({ ...base, tenantStatus: "active", subscriptionStatus: "cancelled", subscriptionAccessUntil: day(10), cardPaid: true, cardRejected: true });
    expect(summary.badge?.text).toBe("Cancelada");
    expect(texts({ tenantStatus: "active", subscriptionStatus: "cancelled", subscriptionAccessUntil: day(10), cardPaid: true })).toEqual(["cancelled"]);
    expect(summary.notices[0].text).toBe("Assinatura cancelada. Seu acesso vai até 2030-06-20.");
  });
});

describe("histórico de pagamentos: uma lista só, com as mesmas palavras", () => {
  it("o mesmo estado tem o mesmo nome em cartão, Pix e boleto", () => {
    expect(cardState("approved")).toBe(chargeState("approved"));
    expect(cardState("rejected")).toBe("refused");
    expect(chargeState("cancelled")).toBe("refused");
    expect(cardState("pending")).toBe(chargeState("pending"));
    expect(cardState("refunded")).toBe(chargeState("refunded"));
    expect(cardState("charged_back")).toBe(chargeState("charged_back"));
    expect(cardState("qualquer-coisa")).toBe("processing");
  });

  it("junta cartão e Pix em ordem do mais novo para o mais antigo", () => {
    const rows = buildPaymentHistory(
      [{ id: "i1", amountCents: 6990, status: "rejected", dueAt: day(-2), paidAt: null, createdAt: day(-2) }],
      [
        { id: "c1", method: "pix", status: "approved", amountCents: 6990, paidAt: day(-1), periodEnd: day(29), createdAt: day(-1) },
        { id: "c2", method: "boleto", status: "expired", amountCents: 6990, paidAt: null, periodEnd: null, createdAt: day(-5) },
      ],
    );
    expect(rows.map((r) => [r.kind, r.state])).toEqual([["pix", "paid"], ["card", "refused"], ["boleto", "expired"]]);
    expect(rows[0].validUntil).toEqual(day(29));
  });

  it("ignora cobrança avulsa de forma desconhecida e lista vazia dá lista vazia", () => {
    expect(buildPaymentHistory([], [{ id: "x", method: "dinheiro", status: "approved", amountCents: 100, paidAt: null, periodEnd: null, createdAt: NOW }])).toEqual([]);
    expect(buildPaymentHistory([], [])).toEqual([]);
  });
});
