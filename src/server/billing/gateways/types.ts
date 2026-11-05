/** Provedores de pagamento que a Agenda sabe operar. */
export const GATEWAYS = ["mercadopago", "stripe"] as const;
export type Gateway = (typeof GATEWAYS)[number];

/** Formas de pagamento escolhidas separadamente no superadmin. */
export const PAYMENT_METHODS = ["card", "pix", "boleto"] as const;
export type PaymentMethod = (typeof PAYMENT_METHODS)[number];

export type GatewaySettings = Record<PaymentMethod, Gateway>;

export const GATEWAY_LABEL: Record<Gateway, string> = { mercadopago: "Mercado Pago", stripe: "Stripe" };
export const METHOD_LABEL: Record<PaymentMethod, string> = { card: "Cartão de crédito", pix: "Pix", boleto: "Boleto" };

/**
 * O que cada provedor sabe fazer aqui. Só vale `true` o que está implementado e validado:
 * a Stripe cobra cartão por assinatura; Pix e boleto avulsos continuam só na Mercado Pago.
 */
export const CAPABILITIES: Record<Gateway, Record<PaymentMethod, boolean>> = {
  mercadopago: { card: true, pix: true, boleto: true },
  stripe: { card: true, pix: false, boleto: false },
};

export const DEFAULT_SETTINGS: GatewaySettings = { card: "mercadopago", pix: "mercadopago", boleto: "mercadopago" };

export const isGateway = (value: unknown): value is Gateway => typeof value === "string" && (GATEWAYS as readonly string[]).includes(value);
export const isPaymentMethod = (value: unknown): value is PaymentMethod => typeof value === "string" && (PAYMENT_METHODS as readonly string[]).includes(value);

/** O provedor padrão escolhido não pode ser usado agora (faltam credenciais ou ele não faz essa forma de pagamento). */
export class GatewayUnavailableError extends Error {
  constructor(readonly gateway: Gateway, readonly method: PaymentMethod, message: string) {
    super(message);
  }
}
