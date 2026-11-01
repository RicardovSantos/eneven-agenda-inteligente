import { and, asc, eq, exists, isNotNull, lte, ne, notExists } from "drizzle-orm";
import { billingInvoices, billingNotices, tenants } from "@/db/schema";
import type { Db } from "@/db/types";
import { sendEmail } from "@/server/email/send";

type TestSender = (recipient: string) => Promise<void>;

/** Aviso de teste: sempre para o endereço de teste, nunca em produção. */
export async function processTestBillingNotices(db: Db, recipient: string, sender: TestSender, now = new Date(), limit = 20) {
  if (process.env.NODE_ENV === "production") throw new Error("Avisos de teste indisponíveis em produção.");
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(recipient) || recipient.length > 254 || !Number.isFinite(now.getTime())) throw new Error("Configuração de teste inválida.");
  return processBillingNotices(db, () => sender(recipient), { now, limit });
}

/**
 * Reserva antes do envio, um aviso por atraso. Uma falha incerta permanece para
 * revisão, sem repetição. `requireUnpaidInvoice`: só avisa quem tem fatura não paga
 * (o fim de uma assinatura cancelada também usa o estado de atraso, mas sem aviso).
 */
export async function processBillingNotices(
  db: Db,
  send: (tenantId: string) => Promise<void>,
  { now = new Date(), limit = 20, requireUnpaidInvoice = false }: { now?: Date; limit?: number; requireUnpaidInvoice?: boolean } = {},
) {
  if (!Number.isFinite(now.getTime())) throw new Error("Data inválida.");
  const max = Number.isFinite(limit) ? Math.min(100, Math.max(0, Math.floor(limit))) : 0;
  const result = { sent: 0, uncertain: 0 };
  if (!max) return result;
  const candidates = await db.select({ id: tenants.id, pastDueAt: tenants.pastDueAt }).from(tenants)
    .where(and(
      eq(tenants.status, "past_due"),
      isNotNull(tenants.pastDueAt),
      lte(tenants.pastDueAt, now),
      requireUnpaidInvoice
        ? exists(db.select({ id: billingInvoices.id }).from(billingInvoices).where(and(eq(billingInvoices.tenantId, tenants.id), ne(billingInvoices.providerStatus, "approved"))))
        : undefined,
      notExists(db.select({ id: billingNotices.id }).from(billingNotices).where(and(
        eq(billingNotices.tenantId, tenants.id),
        eq(billingNotices.pastDueAt, tenants.pastDueAt),
      ))),
    ))
    .orderBy(asc(tenants.pastDueAt), asc(tenants.id)).limit(max);
  for (const candidate of candidates) {
    if (!candidate.pastDueAt) continue;
    const reserved = await db.transaction(async (tx) => {
      const [tenant] = await tx.select({ status: tenants.status, pastDueAt: tenants.pastDueAt }).from(tenants).where(eq(tenants.id, candidate.id)).limit(1).for("update");
      if (!tenant || tenant.status !== "past_due" || tenant.pastDueAt?.getTime() !== candidate.pastDueAt!.getTime()) return null;
      const [notice] = await tx.insert(billingNotices).values({ tenantId: candidate.id, pastDueAt: candidate.pastDueAt!, createdAt: now }).onConflictDoNothing().returning({ id: billingNotices.id });
      return notice ?? null;
    });
    if (!reserved) continue;
    let state: "sent" | "uncertain";
    try { await send(candidate.id); state = "sent"; } catch { state = "uncertain"; }
    await db.update(billingNotices).set({ state, completedAt: now }).where(and(eq(billingNotices.id, reserved.id), eq(billingNotices.state, "sending")));
    result[state]++;
  }
  return result;
}

/** Texto genérico e endereço de teste explícito, sem identificar estabelecimentos. */
export async function sendTestBillingNotice(recipient: string): Promise<void> {
  await sendEmail({ to: recipient, subject: "Teste de aviso de pagamento pendente", text: "Esta é uma mensagem de teste da Eneven Agenda.", html: "<p>Esta é uma mensagem de teste da Eneven Agenda.</p>" });
}
