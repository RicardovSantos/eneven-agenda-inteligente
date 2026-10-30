import { expect, it } from "vitest";
import { verifyPaymentOwnership } from "@/server/billing/verify-payment";

it("aceita apenas pagamento do vendedor, ambiente, referência e valor esperados", () => {
  const expected = { paymentId: "123", externalReference: "invoice-internal-1", collectorId: "42", amountCents: 3990, liveMode: false };
  const payment = { id: 123, external_reference: expected.externalReference, collector_id: 42, live_mode: false, currency_id: "BRL", transaction_amount: 39.9 };
  expect(verifyPaymentOwnership(payment, expected)).toBe(true);
  for (const altered of [
    { id: 124 }, { external_reference: "outra-fatura" }, { collector_id: 43 },
    { live_mode: true }, { currency_id: "USD" }, { transaction_amount: 39.91 }, { transaction_amount: 39.901 },
  ]) expect(verifyPaymentOwnership({ ...payment, ...altered }, expected)).toBe(false);
});
