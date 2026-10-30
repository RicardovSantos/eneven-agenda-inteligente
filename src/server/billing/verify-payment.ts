/** Dados esperados devem vir de uma fatura criada pela própria plataforma. */
export type ExpectedPayment = {
  paymentId: string;
  externalReference: string;
  collectorId: string;
  amountCents: number;
  liveMode: boolean;
};

/** Não aplica efeitos: o chamador ainda deve controlar idempotência e ordem. */
export function verifyPaymentOwnership(resource: Record<string, unknown>, expected: ExpectedPayment): boolean {
  if (!expected.paymentId || !expected.externalReference || !expected.collectorId || !Number.isSafeInteger(expected.amountCents) || expected.amountCents < 0) return false;
  if (String(resource.id ?? "") !== expected.paymentId || resource.external_reference !== expected.externalReference) return false;
  if (String(resource.collector_id ?? "") !== expected.collectorId || resource.live_mode !== expected.liveMode || resource.currency_id !== "BRL") return false;
  if (typeof resource.transaction_amount !== "number" || !Number.isFinite(resource.transaction_amount)) return false;
  const cents = resource.transaction_amount * 100;
  return Number.isSafeInteger(Math.round(cents)) && Math.abs(cents - Math.round(cents)) < 1e-7 && Math.round(cents) === expected.amountCents;
}
