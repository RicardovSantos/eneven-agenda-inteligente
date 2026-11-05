import { inArray } from "drizzle-orm";
import { paymentGatewaySettings } from "@/db/schema";
import type { Db } from "@/db/types";
import { gatewayReadiness } from "./readiness";
import { DEFAULT_SETTINGS, GatewayUnavailableError, GATEWAY_LABEL, METHOD_LABEL, PAYMENT_METHODS, isGateway, type Gateway, type GatewaySettings, type PaymentMethod } from "./types";

/** Provedor padrão de cada forma de pagamento (linha ausente ou valor desconhecido valem Mercado Pago). */
export async function getGatewaySettings(db: Db): Promise<GatewaySettings> {
  const rows = await db.select().from(paymentGatewaySettings).where(inArray(paymentGatewaySettings.method, [...PAYMENT_METHODS]));
  const settings: GatewaySettings = { ...DEFAULT_SETTINGS };
  for (const row of rows) {
    if ((PAYMENT_METHODS as readonly string[]).includes(row.method) && isGateway(row.provider)) settings[row.method as PaymentMethod] = row.provider;
  }
  return settings;
}

/**
 * Provedor que atende uma NOVA contratação ou cobrança desta forma de pagamento. Lê sempre o banco
 * (nunca o navegador). Se o padrão escolhido não está pronto, falha de forma clara: não passa a
 * cobrança para o outro provedor sozinho, porque isso exigiria nova ação do cliente.
 * Só vale para criar; o que já existe usa o `provider` gravado no próprio registro.
 */
export async function resolveGateway(db: Db, method: PaymentMethod, env: Record<string, string | undefined> = process.env): Promise<Gateway> {
  const gateway = (await getGatewaySettings(db))[method];
  const readiness = gatewayReadiness(gateway, method, env);
  if (!readiness.ready) {
    throw new GatewayUnavailableError(gateway, method, `${METHOD_LABEL[method]} em ${GATEWAY_LABEL[gateway]} está indisponível agora. ${readiness.reason ?? ""}`.trim());
  }
  return gateway;
}
