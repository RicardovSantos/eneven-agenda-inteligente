import { desc, eq } from "drizzle-orm";
import { auditLog, paymentGatewaySettings } from "@/db/schema";
import type { Db } from "@/db/types";
import { gatewayReadiness, type GatewayReadiness } from "@/server/billing/gateways/readiness";
import { getGatewaySettings } from "@/server/billing/gateways/router";
import { CAPABILITIES, GATEWAYS, GATEWAY_LABEL, METHOD_LABEL, PAYMENT_METHODS, isGateway, isPaymentMethod, type Gateway, type PaymentMethod } from "@/server/billing/gateways/types";
import type { AdminActor } from "./actions";
import { PlatformError } from "./errors";

type Env = Record<string, string | undefined>;

export type GatewayOption = { gateway: Gateway; label: string; readiness: GatewayReadiness };
export type MethodSetting = { method: PaymentMethod; label: string; current: Gateway; options: GatewayOption[] };

/** Para a tela do superadmin: o padrão atual de cada forma e quais provedores podem ser escolhidos. */
export async function getPaymentRouting(db: Db, env: Env = process.env): Promise<MethodSetting[]> {
  const settings = await getGatewaySettings(db);
  return PAYMENT_METHODS.map((method) => ({
    method,
    label: METHOD_LABEL[method],
    current: settings[method],
    // Só aparecem os provedores que fazem esta forma de pagamento (nada que pareça funcionar sem estar feito).
    options: GATEWAYS.filter((gateway) => CAPABILITIES[gateway][method]).map((gateway) => ({ gateway, label: GATEWAY_LABEL[gateway], readiness: gatewayReadiness(gateway, method, env) })),
  }));
}

/**
 * Muda o provedor padrão de UMA forma de pagamento para novas contratações. Valida tudo no servidor
 * (forma, provedor, capacidade e credenciais) e grava a auditoria na mesma transação. Não toca em
 * nenhuma assinatura ou cobrança existente. Só chame depois de `requireSuperAdminSession()`.
 */
export async function setPaymentGateway(db: Db, actor: AdminActor, input: { method: unknown; provider: unknown }, env: Env = process.env): Promise<{ changed: boolean }> {
  const { method, provider } = input;
  if (!isPaymentMethod(method) || !isGateway(provider)) throw new PlatformError("validation", "Escolha inválida.");
  if (!CAPABILITIES[provider][method]) throw new PlatformError("validation", `${GATEWAY_LABEL[provider]} não faz ${METHOD_LABEL[method].toLowerCase()} aqui.`);
  const readiness = gatewayReadiness(provider, method, env);
  if (!readiness.ready) throw new PlatformError("invalid_state", `${GATEWAY_LABEL[provider]} não está pronta: ${readiness.reason ?? "indisponível"}`);

  return db.transaction(async (tx) => {
    const [before] = await tx.select().from(paymentGatewaySettings).where(eq(paymentGatewaySettings.method, method)).limit(1).for("update");
    const from = before && isGateway(before.provider) ? before.provider : "mercadopago";
    if (before && from === provider) return { changed: false };
    const now = new Date();
    if (before) await tx.update(paymentGatewaySettings).set({ provider, updatedAt: now, updatedBy: actor.userId }).where(eq(paymentGatewaySettings.method, method));
    else await tx.insert(paymentGatewaySettings).values({ method, provider, updatedAt: now, updatedBy: actor.userId });
    await tx.insert(auditLog).values({ actorUserId: actor.userId, tenantId: null, action: "payment_gateway.changed", details: { method, from, to: provider } });
    return { changed: true };
  });
}

export type GatewayChange = { id: number; at: Date; method: string; from: string; to: string };

/** Últimas trocas de provedor padrão, da auditoria (mais recentes primeiro). */
export async function listGatewayChanges(db: Db, limit = 10): Promise<GatewayChange[]> {
  const rows = await db.select({ id: auditLog.id, at: auditLog.createdAt, details: auditLog.details }).from(auditLog)
    .where(eq(auditLog.action, "payment_gateway.changed")).orderBy(desc(auditLog.id)).limit(limit);
  return rows.flatMap((row) => {
    const d = row.details as { method?: unknown; from?: unknown; to?: unknown } | null;
    return d && typeof d.method === "string" && typeof d.from === "string" && typeof d.to === "string" ? [{ id: row.id, at: row.at, method: d.method, from: d.from, to: d.to }] : [];
  });
}
