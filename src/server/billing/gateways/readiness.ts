import { billingConfig } from "../mode";
import { stripeConfig } from "../stripe/config";
import { CAPABILITIES, type Gateway, type PaymentMethod } from "./types";

type Env = Record<string, string | undefined>;

export type GatewayReadiness = {
  /** Pode ser escolhido como padrão e usado agora. */
  ready: boolean;
  status: "configured" | "missing_credentials" | "unavailable";
  /** Texto curto para a tela quando não está pronto. */
  reason?: string;
};

/** Credenciais e modo do provedor (independe da forma de pagamento). */
export function gatewayCredentials(gateway: Gateway, env: Env = process.env): GatewayReadiness {
  if (gateway === "mercadopago") {
    return billingConfig(env) ? { ready: true, status: "configured" } : { ready: false, status: "missing_credentials", reason: "Faltam as credenciais da Mercado Pago." };
  }
  return stripeConfig(env) ? { ready: true, status: "configured" } : { ready: false, status: "missing_credentials", reason: "Faltam a chave secreta e o segredo do webhook da Stripe." };
}

/** Pronto para esta forma de pagamento: o provedor sabe fazê-la e tem credenciais. */
export function gatewayReadiness(gateway: Gateway, method: PaymentMethod, env: Env = process.env): GatewayReadiness {
  if (!CAPABILITIES[gateway][method]) return { ready: false, status: "unavailable", reason: "Indisponível para esta forma de pagamento." };
  return gatewayCredentials(gateway, env);
}
