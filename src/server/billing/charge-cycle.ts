import { and, asc, eq, gt, inArray, isNotNull, lte, notExists } from "drizzle-orm";
import { auditLog, billingCharges, billingInvoices, billingNotices, billingRenewalNotices, billingSubscriptions, tenants } from "@/db/schema";
import type { Db } from "@/db/types";

const DAY = 24 * 60 * 60_000;
/** Quantos dias antes do fim do período pago o dono é avisado. */
export const RENEWAL_NOTICE_DAYS = 10;
/** Cobrança pendente que passou da validade há mais de um dia vira "vencida". */
const STALE_AFTER_MS = DAY;
const CARD_STATES = ["creating", "uncertain", "pending", "authorized", "paused"];

const noCardSubscription = (db: Db) =>
  notExists(db.select({ id: billingSubscriptions.id }).from(billingSubscriptions)
    .where(and(eq(billingSubscriptions.tenantId, tenants.id), inArray(billingSubscriptions.providerStatus, CARD_STATES))));

/**
 * Quem pagou por Pix ou boleto e passou do fim do mês pago entra em atraso (com a carência de 7 dias
 * de sempre). Não mexe em quem tem assinatura de cartão, bloqueio manual ou conta cancelada.
 */
export async function expirePaidAccess(db: Db, now = new Date()): Promise<{ expired: number }> {
  const due = await db.select({ id: tenants.id, paidUntil: tenants.paidUntil }).from(tenants)
    .where(and(eq(tenants.status, "active"), isNotNull(tenants.paidUntil), lte(tenants.paidUntil, now), noCardSubscription(db)))
    .orderBy(asc(tenants.paidUntil), asc(tenants.id)).limit(200);
  let expired = 0;
  for (const tenant of due) {
    const updated = await db.update(tenants).set({ status: "past_due", pastDueAt: tenant.paidUntil })
      .where(and(eq(tenants.id, tenant.id), eq(tenants.status, "active"), lte(tenants.paidUntil, now))).returning({ id: tenants.id });
    if (!updated.length) continue;
    await db.insert(auditLog).values({ tenantId: tenant.id, action: "billing.paid_access_expired", details: { until: tenant.paidUntil?.toISOString() ?? null } });
    expired++;
  }
  return { expired };
}

/** Cobranças em aberto cuja validade acabou: libera o dono para gerar outra. */
export async function expireStaleCharges(db: Db, now = new Date()): Promise<{ expired: number }> {
  const updated = await db.update(billingCharges).set({ status: "expired" })
    .where(and(eq(billingCharges.status, "pending"), lte(billingCharges.expiresAt, new Date(now.getTime() - STALE_AFTER_MS))))
    .returning({ id: billingCharges.id });
  return { expired: updated.length };
}

/**
 * "Seu plano vence em breve": um aviso por fim de período pago, para quem paga por Pix ou boleto
 * e ainda não tem cobrança em aberto. Resultado incerto fica para revisão, sem repetir.
 */
export async function processRenewalNotices(
  db: Db,
  send: (tenantId: string, periodEnd: Date) => Promise<void>,
  { now = new Date(), limit = 50 }: { now?: Date; limit?: number } = {},
): Promise<{ sent: number; uncertain: number }> {
  const result = { sent: 0, uncertain: 0 };
  const candidates = await db.select({ id: tenants.id, paidUntil: tenants.paidUntil }).from(tenants)
    .where(and(
      eq(tenants.status, "active"),
      isNotNull(tenants.paidUntil),
      gt(tenants.paidUntil, now),
      lte(tenants.paidUntil, new Date(now.getTime() + RENEWAL_NOTICE_DAYS * DAY)),
      noCardSubscription(db),
      notExists(db.select({ id: billingCharges.id }).from(billingCharges).where(and(eq(billingCharges.tenantId, tenants.id), inArray(billingCharges.status, ["creating", "uncertain", "pending"])))),
      notExists(db.select({ id: billingRenewalNotices.id }).from(billingRenewalNotices).where(and(eq(billingRenewalNotices.tenantId, tenants.id), eq(billingRenewalNotices.periodEnd, tenants.paidUntil)))),
    ))
    .orderBy(asc(tenants.paidUntil), asc(tenants.id)).limit(Math.max(0, Math.min(100, limit)));
  for (const candidate of candidates) {
    if (!candidate.paidUntil) continue;
    const [notice] = await db.insert(billingRenewalNotices).values({ tenantId: candidate.id, periodEnd: candidate.paidUntil, createdAt: now }).onConflictDoNothing().returning({ id: billingRenewalNotices.id });
    if (!notice) continue;
    let state: "sent" | "uncertain";
    try { await send(candidate.id, candidate.paidUntil); state = "sent"; } catch { state = "uncertain"; }
    await db.update(billingRenewalNotices).set({ state, completedAt: now }).where(and(eq(billingRenewalNotices.id, notice.id), eq(billingRenewalNotices.state, "sending")));
    result[state]++;
  }
  return result;
}

/**
 * "Pagamento vencido": para quem entrou em atraso por Pix ou boleto (o atraso começa no fim do
 * período pago). Usa a mesma reserva dos avisos de cartão, uma por atraso.
 */
export async function processChargeOverdueNotices(
  db: Db,
  send: (tenantId: string) => Promise<void>,
  { now = new Date(), limit = 50 }: { now?: Date; limit?: number } = {},
): Promise<{ sent: number; uncertain: number }> {
  const result = { sent: 0, uncertain: 0 };
  const candidates = await db.select({ id: tenants.id, pastDueAt: tenants.pastDueAt }).from(tenants)
    .where(and(
      eq(tenants.status, "past_due"),
      isNotNull(tenants.pastDueAt),
      lte(tenants.pastDueAt, now),
      eq(tenants.paidUntil, tenants.pastDueAt),
      noCardSubscription(db),
      notExists(db.select({ id: billingInvoices.id }).from(billingInvoices).where(eq(billingInvoices.tenantId, tenants.id))),
      notExists(db.select({ id: billingNotices.id }).from(billingNotices).where(and(eq(billingNotices.tenantId, tenants.id), eq(billingNotices.pastDueAt, tenants.pastDueAt)))),
    ))
    .orderBy(asc(tenants.pastDueAt), asc(tenants.id)).limit(Math.max(0, Math.min(100, limit)));
  for (const candidate of candidates) {
    if (!candidate.pastDueAt) continue;
    const [notice] = await db.insert(billingNotices).values({ tenantId: candidate.id, pastDueAt: candidate.pastDueAt, createdAt: now }).onConflictDoNothing().returning({ id: billingNotices.id });
    if (!notice) continue;
    let state: "sent" | "uncertain";
    try { await send(candidate.id); state = "sent"; } catch { state = "uncertain"; }
    await db.update(billingNotices).set({ state, completedAt: now }).where(and(eq(billingNotices.id, notice.id), eq(billingNotices.state, "sending")));
    result[state]++;
  }
  return result;
}

/** Um passo do ciclo diário para Pix e boleto. */
export async function runChargeCycle(
  db: Db,
  senders: { renewal: (tenantId: string, periodEnd: Date) => Promise<void>; overdue: (tenantId: string) => Promise<void> },
  now = new Date(),
) {
  const stale = await expireStaleCharges(db, now);
  const access = await expirePaidAccess(db, now);
  const renewal = await processRenewalNotices(db, senders.renewal, { now });
  const overdue = await processChargeOverdueNotices(db, senders.overdue, { now });
  return { stale, access, renewal, overdue };
}
