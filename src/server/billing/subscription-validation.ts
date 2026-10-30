const CHECKOUT_HOSTS = new Set(["www.mercadopago.com.br", "sandbox.mercadopago.com.br", "www.mercadopago.com.ar", "sandbox.mercadopago.com.ar"]);

/** Valida os dados retornados pelo provedor antes de salvar o link de pagamento. */
export function validatePendingSubscription(result: Record<string, unknown>, expected: { reference: string; collectorId: string; priceCents: number }): { id: string; checkoutUrl: string } {
  if (!expected.reference || !expected.collectorId || !Number.isSafeInteger(expected.priceCents) || expected.priceCents <= 0) throw new Error("Dados esperados inválidos.");
  if (typeof result.id !== "string" || !/^[A-Za-z0-9_-]{1,200}$/.test(result.id) || result.external_reference !== expected.reference || String(result.collector_id ?? "") !== expected.collectorId || result.status !== "pending" || typeof result.init_point !== "string") throw new Error("Resposta inválida.");
  const recurring = result.auto_recurring;
  if (!recurring || typeof recurring !== "object" || Array.isArray(recurring)) throw new Error("Cobrança inválida.");
  const terms = recurring as Record<string, unknown>;
  const amount = terms.transaction_amount;
  if ((typeof amount !== "number" && (typeof amount !== "string" || !/^\d+(?:\.\d{1,2})?$/.test(amount))) || !Number.isFinite(Number(amount)) || terms.currency_id !== "BRL" || terms.frequency !== 1 || terms.frequency_type !== "months" || Math.abs(Number(amount) * 100 - expected.priceCents) > 1e-7) throw new Error("Cobrança inválida.");
  const checkout = new URL(result.init_point);
  if (checkout.protocol !== "https:" || !CHECKOUT_HOSTS.has(checkout.hostname) || checkout.username || checkout.password || checkout.port) throw new Error("Endereço de pagamento inválido.");
  return { id: result.id, checkoutUrl: checkout.toString() };
}
