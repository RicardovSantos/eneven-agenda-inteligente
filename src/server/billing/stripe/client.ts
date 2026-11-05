import Stripe from "stripe";
import type { StripeConfig } from "./config";

/** Cliente da Stripe. A versão da API é a que a própria SDK instalada fixa (não muda sem atualizar a SDK). */
export function getStripe(config: StripeConfig): Stripe {
  return new Stripe(config.secretKey, { maxNetworkRetries: 2, timeout: 15_000, telemetry: false, appInfo: { name: "Eneven Agenda" } });
}

export type StripeId = string | { id: string } | null | undefined;

/** Id de um campo que a Stripe devolve como texto ou como objeto expandido. */
export function idOf(value: StripeId): string | null {
  if (typeof value === "string") return value;
  if (value && typeof value === "object" && typeof value.id === "string") return value.id;
  return null;
}
