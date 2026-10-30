export type BillingTopic = "payment" | "subscription_preapproval" | "subscription_authorized_payment";

const paths: Record<BillingTopic, string> = {
  payment: "/v1/payments/",
  subscription_preapproval: "/preapproval/",
  subscription_authorized_payment: "/authorized_payments/",
};

/** Consulta somente recursos identificados pelo evento; não altera o estado local. */
export async function fetchMercadoPagoResource(
  topic: BillingTopic,
  id: string,
  accessToken: string | undefined,
  fetcher: typeof fetch = fetch,
): Promise<Record<string, unknown>> {
  if (!accessToken) throw new Error("Mercado Pago não configurado.");
  // Restringe o caminho para não enviar o token a outro destino ou endpoint.
  if (!/^[A-Za-z0-9_-]{1,200}$/.test(id) || !Object.hasOwn(paths, topic)) throw new Error("Identificador inválido.");
  const response = await fetcher(`https://api.mercadopago.com${paths[topic]}${encodeURIComponent(id)}`, {
    headers: { Authorization: `Bearer ${accessToken}`, Accept: "application/json" },
    signal: AbortSignal.timeout(10_000),
    redirect: "error",
  });
  if (!response.ok) throw new Error(`Falha ao consultar Mercado Pago: HTTP ${response.status}`);
  const resource: unknown = await response.json();
  if (!resource || typeof resource !== "object" || Array.isArray(resource) || !("id" in resource) || String(resource.id) !== id) {
    throw new Error("Resposta inválida do Mercado Pago.");
  }
  return resource as Record<string, unknown>;
}
