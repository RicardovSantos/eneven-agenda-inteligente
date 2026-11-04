import { and, eq, inArray, sql } from "drizzle-orm";
import { auditLog, billingCharges, billingSubscriptions, memberships, plans, tenants, users } from "@/db/schema";
import type { Db } from "@/db/types";
import { parseBoletoPayer } from "./charge-payer";
import { addOneMonthUtc } from "./paid-through";
import { assertBillingConfig } from "./mode";
import { fetchMercadoPagoResource } from "./mercado-pago-client";
import { assertSandboxAccount } from "./sandbox";
import { verifyPaymentOwnership } from "./verify-payment";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const DAY = 24 * 60 * 60_000;
/** Validade de cada forma: o Pix vence rápido; o boleto precisa de dias para compensar. */
const VALID_DAYS = { pix: 7, boleto: 10 } as const;
const PAYMENT_METHOD = { pix: "pix", boleto: "bolbradesco" } as const;
const OPEN_SUBSCRIPTION = ["creating", "uncertain", "pending", "authorized", "paused"];
const PROVIDER_HOSTS = /(^|\.)mercadopago\.com(\.br)?$/;

export type ChargeMethod = keyof typeof PAYMENT_METHOD;
export const CHARGE_REFERENCE_PREFIX = "charge:";

export class ChargeError extends Error {
  constructor(message: string, readonly fieldErrors?: Record<string, string>) {
    super(message);
  }
}

type Config = { accessToken: string; collectorId: string; live?: boolean; fetcher?: typeof fetch };

function safeUrl(value: unknown): string | null {
  if (typeof value !== "string") return null;
  try {
    const url = new URL(value);
    if (url.protocol !== "https:" || url.username || url.password || url.port || !PROVIDER_HOSTS.test(url.hostname)) return null;
    return url.toString();
  } catch {
    return null;
  }
}

/** Lê `a.b.c` de um objeto sem confiar no formato. */
function pick(source: unknown, path: string[]): unknown {
  let current = source;
  for (const key of path) {
    if (!current || typeof current !== "object" || Array.isArray(current)) return undefined;
    current = (current as Record<string, unknown>)[key];
  }
  return current;
}

/**
 * Gera o Pix ou o boleto do mês para o dono. O valor é sempre o do plano atual (servidor),
 * nunca do navegador. Um tempo esgotado deixa a cobrança "uncertain" (o provedor pode ter criado).
 */
export async function createCharge(
  db: Db,
  input: { tenantId: string; ownerUserId: string; method: ChargeMethod; payer?: Record<string, unknown> },
  config: Config,
  now: Date = new Date(),
): Promise<{ id: string }> {
  assertBillingConfig(config);
  if (!config.live) await assertSandboxAccount(config.accessToken, config.collectorId, config.fetcher);
  if (!UUID.test(input.tenantId) || !UUID.test(input.ownerUserId) || !Object.hasOwn(PAYMENT_METHOD, input.method)) throw new ChargeError("Dados inválidos.");
  let boleto: ReturnType<typeof parseBoletoPayer> | null = null;
  if (input.method === "boleto") {
    boleto = parseBoletoPayer(input.payer ?? {});
    if (!boleto.ok) throw new ChargeError("Confira os dados do boleto.", boleto.errors);
  }
  const reserved = await db.transaction(async (tx) => {
    await tx.execute(sql`select pg_advisory_xact_lock(hashtext(${input.tenantId}))`);
    const [tenant] = await tx.select({ id: tenants.id, planId: tenants.planId, status: tenants.status, slug: tenants.slug }).from(tenants).where(eq(tenants.id, input.tenantId)).limit(1).for("update");
    const [owner] = await tx.select({ email: users.email }).from(memberships)
      .innerJoin(users, eq(users.id, memberships.userId))
      .where(and(eq(memberships.tenantId, input.tenantId), eq(memberships.userId, input.ownerUserId), eq(memberships.role, "owner"))).limit(1);
    if (!owner) throw new ChargeError("Acesso indisponível.");
    if (!tenant || !["trial", "active", "past_due"].includes(tenant.status)) throw new ChargeError("Plano indisponível.");
    const [plan] = await tx.select().from(plans).where(and(eq(plans.id, tenant.planId), eq(plans.active, true))).limit(1).for("share");
    if (!plan || plan.priceCents <= 0) throw new ChargeError("Plano indisponível.");
    const [card] = await tx.select({ id: billingSubscriptions.id }).from(billingSubscriptions)
      .where(and(eq(billingSubscriptions.tenantId, input.tenantId), inArray(billingSubscriptions.providerStatus, OPEN_SUBSCRIPTION))).limit(1);
    if (card) throw new ChargeError("Este estabelecimento já tem uma assinatura no cartão.");
    const [open] = await tx.select({ id: billingCharges.id }).from(billingCharges)
      .where(and(eq(billingCharges.tenantId, input.tenantId), inArray(billingCharges.status, ["creating", "uncertain", "pending"]))).limit(1);
    if (open) throw new ChargeError("Já existe um pagamento em aberto. Pague ou aguarde ele vencer.");
    const [charge] = await tx.insert(billingCharges).values({ tenantId: input.tenantId, planId: plan.id, method: input.method, amountCents: plan.priceCents, status: "creating" }).returning({ id: billingCharges.id });
    return { id: charge.id, amountCents: plan.priceCents, planName: plan.name, slug: tenant.slug, email: owner.email };
  });
  const expiresAt = new Date(now.getTime() + VALID_DAYS[input.method] * DAY);
  const payer: Record<string, unknown> = { email: reserved.email };
  if (boleto?.ok) {
    const [first, ...rest] = boleto.payer.name.split(" ");
    Object.assign(payer, {
      first_name: first,
      last_name: rest.join(" "),
      identification: { type: boleto.payer.documentType, number: boleto.payer.document },
      address: {
        zip_code: boleto.payer.zipCode,
        street_name: boleto.payer.street,
        street_number: boleto.payer.number,
        neighborhood: boleto.payer.neighborhood,
        city: boleto.payer.city,
        federal_unit: boleto.payer.state,
      },
    });
  }
  try {
    const response = await (config.fetcher ?? fetch)("https://api.mercadopago.com/v1/payments", {
      method: "POST",
      redirect: "error",
      signal: AbortSignal.timeout(15_000),
      headers: { Authorization: `Bearer ${config.accessToken}`, "Content-Type": "application/json", Accept: "application/json", "X-Idempotency-Key": reserved.id },
      body: JSON.stringify({
        transaction_amount: reserved.amountCents / 100,
        description: `Eneven - ${reserved.planName} · ${reserved.slug}`,
        payment_method_id: PAYMENT_METHOD[input.method],
        external_reference: `${CHARGE_REFERENCE_PREFIX}${reserved.id}`,
        date_of_expiration: expiresAt.toISOString(),
        payer,
      }),
    });
    if (!response.ok) throw new Error("Falha ao criar a cobrança.");
    const body: unknown = await response.json();
    const id = pick(body, ["id"]);
    const valid =
      (typeof id === "number" || typeof id === "string") && /^\d{1,30}$/.test(String(id)) &&
      pick(body, ["external_reference"]) === `${CHARGE_REFERENCE_PREFIX}${reserved.id}` &&
      pick(body, ["status"]) === "pending" &&
      String(pick(body, ["collector_id"]) ?? "") === config.collectorId &&
      pick(body, ["currency_id"]) === "BRL" &&
      Math.round(Number(pick(body, ["transaction_amount"])) * 100) === reserved.amountCents;
    if (!valid) throw new Error("Resposta inválida.");
    const qrCode = pick(body, ["point_of_interaction", "transaction_data", "qr_code"]);
    const qrBase64 = pick(body, ["point_of_interaction", "transaction_data", "qr_code_base64"]);
    const ticketUrl = safeUrl(pick(body, ["transaction_details", "external_resource_url"])) ?? safeUrl(pick(body, ["point_of_interaction", "transaction_data", "ticket_url"]));
    const barcode = pick(body, ["barcode", "content"]);
    if (input.method === "pix" && (typeof qrCode !== "string" || !qrCode)) throw new Error("Resposta inválida.");
    if (input.method === "boleto" && !ticketUrl) throw new Error("Resposta inválida.");
    const updated = await db.update(billingCharges).set({
      status: "pending",
      providerPaymentId: String(id),
      qrCode: typeof qrCode === "string" ? qrCode.slice(0, 2000) : null,
      qrCodeBase64: typeof qrBase64 === "string" && qrBase64.length < 100_000 ? qrBase64 : null,
      ticketUrl,
      barcode: typeof barcode === "string" ? barcode.slice(0, 100) : null,
      expiresAt,
    }).where(and(eq(billingCharges.id, reserved.id), eq(billingCharges.status, "creating"))).returning({ id: billingCharges.id });
    if (!updated.length) throw new Error("Tentativa indisponível.");
    return { id: reserved.id };
  } catch {
    // Mesmo um tempo esgotado pode ter criado o pagamento no provedor: revisar antes de repetir.
    await db.update(billingCharges).set({ status: "uncertain" }).where(and(eq(billingCharges.id, reserved.id), eq(billingCharges.status, "creating")));
    throw new ChargeError("Não foi possível confirmar a criação do pagamento. Tente de novo em alguns minutos.");
  }
}

const FINAL_STATUS: Record<string, string> = { cancelled: "expired", rejected: "cancelled", refunded: "refunded", charged_back: "charged_back" };

/**
 * Aplica um pagamento avisado pela Mercado Pago a uma cobrança avulsa. Idempotente: só
 * `pending` vira `approved` (soma um mês de acesso uma única vez); avisos antigos são ignorados.
 * Reembolso e contestação não mexem no acesso: ficam registrados para revisão.
 */
export async function reconcileCharge(
  db: Db,
  paymentId: string,
  config: { accessToken: string; collectorId: string; liveMode: boolean; fetcher?: typeof fetch },
  now: Date = new Date(),
): Promise<"updated" | "unchanged"> {
  const payment = await fetchMercadoPagoResource("payment", paymentId, config.accessToken, config.fetcher);
  const reference = payment.external_reference;
  if (typeof reference !== "string" || !reference.startsWith(CHARGE_REFERENCE_PREFIX) || !UUID.test(reference.slice(CHARGE_REFERENCE_PREFIX.length))) throw new Error("Referência de cobrança inválida.");
  const chargeId = reference.slice(CHARGE_REFERENCE_PREFIX.length);
  if (typeof payment.status !== "string" || typeof payment.date_last_updated !== "string") throw new Error("Pagamento inválido.");
  const updatedAt = new Date(payment.date_last_updated);
  if (!Number.isFinite(updatedAt.getTime())) throw new Error("Data de atualização inválida.");
  const mapped = payment.status === "approved" ? "approved" : payment.status === "pending" || payment.status === "in_process" ? "pending" : FINAL_STATUS[payment.status];
  if (!mapped) throw new Error("Status de pagamento desconhecido.");
  let paidAt: Date | null = null;
  if (mapped === "approved") {
    paidAt = typeof payment.date_approved === "string" ? new Date(payment.date_approved) : null;
    if (!paidAt || !Number.isFinite(paidAt.getTime())) throw new Error("Data de pagamento ausente.");
  }
  return db.transaction(async (tx) => {
    const [charge] = await tx.select().from(billingCharges).where(eq(billingCharges.id, chargeId)).limit(1).for("update");
    if (!charge || !charge.providerPaymentId || charge.providerPaymentId !== paymentId) throw new Error("Pagamento não corresponde à cobrança.");
    if (!verifyPaymentOwnership(payment, { paymentId, externalReference: reference, collectorId: config.collectorId, amountCents: charge.amountCents, liveMode: config.liveMode })) throw new Error("Pagamento não corresponde à cobrança.");
    if (charge.providerUpdatedAt && charge.providerUpdatedAt.getTime() >= updatedAt.getTime()) return "unchanged";
    // Cobrança aprovada só muda para reembolso ou contestação; nunca volta a pendente nem soma outro mês.
    if (charge.status === "approved" && mapped !== "refunded" && mapped !== "charged_back") {
      await tx.update(billingCharges).set({ providerUpdatedAt: updatedAt }).where(eq(billingCharges.id, chargeId));
      return "unchanged";
    }
    if (mapped === "approved") {
      const [tenant] = await tx.select().from(tenants).where(eq(tenants.id, charge.tenantId)).limit(1).for("update");
      if (!tenant) throw new Error("Estabelecimento não encontrado.");
      // O mês começa depois do que já está pago e depois do teste grátis (que não se perde).
      const base = Math.max(now.getTime(), tenant.paidUntil?.getTime() ?? 0, tenant.status === "trial" ? tenant.trialEndsAt.getTime() : 0);
      const periodStart = new Date(base);
      const periodEnd = addOneMonthUtc(periodStart);
      await tx.update(billingCharges).set({ status: "approved", providerUpdatedAt: updatedAt, paidAt, periodStart, periodEnd }).where(eq(billingCharges.id, chargeId));
      // Bloqueio manual e conta cancelada só mudam por ação explícita; o mês pago fica registrado de qualquer forma.
      const reactivate = tenant.status === "trial" || tenant.status === "active" || tenant.status === "past_due";
      await tx.update(tenants).set({ paidUntil: periodEnd, ...(reactivate ? { status: "active" as const, pastDueAt: null, activatedAt: tenant.activatedAt ?? now } : {}) }).where(eq(tenants.id, tenant.id));
      await tx.insert(auditLog).values({ tenantId: tenant.id, action: "billing.charge_approved", details: { method: charge.method, until: periodEnd.toISOString() } });
      return "updated";
    }
    await tx.update(billingCharges).set({ status: mapped, providerUpdatedAt: updatedAt }).where(eq(billingCharges.id, chargeId));
    if (mapped === "refunded" || mapped === "charged_back") {
      await tx.insert(auditLog).values({ tenantId: charge.tenantId, action: "billing.charge_disputed", details: { method: charge.method, status: mapped } });
    }
    return "updated";
  });
}

/**
 * Consulta na Mercado Pago a cobrança avulsa em aberto do estabelecimento e aplica o resultado
 * (a tela do dono chama isso a cada atualização, para mostrar o pagamento sem esperar o relógio
 * do servidor). É a mesma conciliação do aviso: idempotente, e um aviso que chegar depois não soma de novo.
 */
export async function refreshOpenCharge(
  db: Db,
  tenantId: string,
  config: { accessToken: string; collectorId: string; liveMode: boolean; fetcher?: typeof fetch },
): Promise<"updated" | "unchanged" | "none"> {
  const [open] = await db.select({ paymentId: billingCharges.providerPaymentId }).from(billingCharges)
    .where(and(eq(billingCharges.tenantId, tenantId), eq(billingCharges.status, "pending"))).limit(1);
  if (!open?.paymentId) return "none";
  try {
    return await reconcileCharge(db, open.paymentId, config);
  } catch (error) {
    console.warn(`Cobrança avulsa não atualizada (${open.paymentId}): ${error instanceof Error ? error.message : "erro"}`);
    return "unchanged";
  }
}
