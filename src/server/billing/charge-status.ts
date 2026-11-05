import { and, eq } from "drizzle-orm";
import { billingCharges, tenants } from "@/db/schema";
import type { Db } from "@/db/types";
import { reconcileCharge } from "./charges";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
/** Intervalo mínimo entre duas consultas à Mercado Pago do mesmo estabelecimento. */
export const CHECK_INTERVAL_MS = 2_500;
const MAX_TRACKED = 500;

/** Última consulta por estabelecimento (um processo só: o app roda numa réplica). */
const lastCheck = new Map<string, number>();

export type ChargeStatusResult =
  | { state: "none" }
  | { state: "pending" | "failed" | "expired"; method: "pix" | "boleto" }
  | { state: "approved"; method: "pix" | "boleto"; paidUntil: string | null; paidUntilLabel: string | null };

type Config = { accessToken: string; collectorId: string; liveMode: boolean; fetcher?: typeof fetch };
/** Consulta o pagamento no provedor da própria cobrança (Stripe), quando a Stripe está ligada. */
type StripeCheck = (paymentIntentId: string) => Promise<unknown>;

async function readCharge(db: Db, tenantId: string, chargeId: string) {
  const [row] = await db
    .select({ provider: billingCharges.provider, status: billingCharges.status, method: billingCharges.method, providerPaymentId: billingCharges.providerPaymentId, periodEnd: billingCharges.periodEnd })
    .from(billingCharges)
    .where(and(eq(billingCharges.id, chargeId), eq(billingCharges.tenantId, tenantId)))
    .limit(1);
  return row ?? null;
}

/**
 * Situação de UMA cobrança (Pix ou boleto) do estabelecimento, para a tela do QR Code perguntar
 * a cada poucos segundos. Enquanto estiver pendente, confere o pagamento na Mercado Pago (no
 * máximo uma vez a cada 2,5 s por estabelecimento) e aplica o resultado pela mesma conciliação
 * do aviso, que é idempotente: um aviso que chegar depois não soma o mês de novo.
 * O chamador deve ter verificado que a sessão é do dono daquele estabelecimento.
 */
export async function getChargeStatus(
  db: Db,
  tenantId: string,
  chargeId: string,
  options: { config?: Config | null; stripe?: StripeCheck | null; now?: Date } = {},
): Promise<ChargeStatusResult> {
  if (!UUID.test(chargeId)) return { state: "none" };
  const now = options.now ?? new Date();
  let charge = await readCharge(db, tenantId, chargeId);
  if (!charge || (charge.method !== "pix" && charge.method !== "boleto")) return { state: "none" };

  const checker = charge.provider === "stripe" ? options.stripe : options.config;
  if (charge.status === "pending" && charge.providerPaymentId && checker) {
    const last = lastCheck.get(tenantId) ?? 0;
    if (now.getTime() - last >= CHECK_INTERVAL_MS) {
      if (lastCheck.size >= MAX_TRACKED) lastCheck.clear();
      lastCheck.set(tenantId, now.getTime());
      try {
        if (charge.provider === "stripe") await options.stripe!(charge.providerPaymentId);
        else await reconcileCharge(db, charge.providerPaymentId, options.config!);
      } catch (error) {
        // Sem resposta da Mercado Pago agora: segue pendente e a próxima consulta tenta de novo.
        console.warn(`Cobrança avulsa não atualizada (${charge.providerPaymentId}): ${error instanceof Error ? error.message : "erro"}`);
      }
      charge = (await readCharge(db, tenantId, chargeId)) ?? charge;
    }
  }

  const method = charge.method as "pix" | "boleto";
  if (charge.status === "approved") {
    const [tenant] = await db.select({ paidUntil: tenants.paidUntil, timezone: tenants.timezone }).from(tenants).where(eq(tenants.id, tenantId)).limit(1);
    const until = tenant?.paidUntil ?? charge.periodEnd;
    const label = until ? new Intl.DateTimeFormat("pt-BR", { dateStyle: "short", timeZone: tenant?.timezone ?? "America/Sao_Paulo" }).format(until) : null;
    return { state: "approved", method, paidUntil: until ? until.toISOString() : null, paidUntilLabel: label };
  }
  if (charge.status === "expired") return { state: "expired", method };
  if (charge.status === "pending" || charge.status === "creating" || charge.status === "uncertain") return { state: "pending", method };
  return { state: "failed", method };
}
