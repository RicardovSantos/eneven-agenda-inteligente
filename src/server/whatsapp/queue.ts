import { and, asc, eq, gte, isNull, lte, sql } from "drizzle-orm";
import { bookingServices, bookings, customers, plans, professionals, tenantNotificationSettings, tenants, whatsappMessages, whatsappQueue } from "@/db/schema";
import type { Db } from "@/db/types";
import { localDateOf, zonedInstant, addDaysToDate } from "@/server/agenda/time";
import { issueAdditionalManageToken } from "@/server/agenda/bookings";
import { appUrl } from "@/server/email/templates";
import { withTenant, withTenantTx } from "@/server/tenant-db";
import { getWhatsAppChannel } from "./channel";
import { buildTemplatePayload } from "./templates";
import { isTenantActive } from "@/server/tenants/release";

/** Um item reservado nunca é reenviado automaticamente após falha ambígua. */
const CLAIM_UNTIL = new Date("9999-01-01T00:00:00Z");

async function reserveNext(db: Db, now: Date) {
  return db.transaction(async (tx) => {
    // Serializa reservas de cota da plataforma, inclusive destinatários de tenants distintos.
    await tx.execute(sql`select pg_advisory_xact_lock(381942730)`);
    const [item] = await tx.select().from(whatsappQueue)
      .where(and(isNull(whatsappQueue.processedAt), isNull(whatsappQueue.lockedUntil), lte(whatsappQueue.scheduledFor, now)))
      .orderBy(asc(whatsappQueue.scheduledFor), asc(whatsappQueue.id)).limit(1).for("update", { skipLocked: true });
    if (!item) return null;
    const data = await withTenantTx(tx, item.tenantId, async (t) => {
      const [booking] = await t.select({ id: bookings.id, status: bookings.status, startsAt: bookings.startsAt, customerName: customers.name, phone: customers.phone, professionalName: professionals.name })
        .from(bookings).innerJoin(customers, and(eq(customers.id, bookings.customerId), eq(customers.tenantId, bookings.tenantId)))
        .innerJoin(professionals, and(eq(professionals.id, bookings.professionalId), eq(professionals.tenantId, bookings.tenantId)))
        .where(and(eq(bookings.id, item.bookingId), eq(bookings.tenantId, item.tenantId))).limit(1);
      const services = booking ? await t.select({ name: bookingServices.name }).from(bookingServices)
        .where(and(eq(bookingServices.tenantId, item.tenantId), eq(bookingServices.bookingId, item.bookingId))).orderBy(asc(bookingServices.position)) : [];
      const [settings] = await t.select().from(tenantNotificationSettings).where(eq(tenantNotificationSettings.tenantId, item.tenantId)).limit(1);
      return { booking, services, settings };
    });
    const [tenant] = await tx.select({ name: tenants.name, timezone: tenants.timezone, status: tenants.status, trialEndsAt: tenants.trialEndsAt, planCode: plans.code, limit: plans.monthlyMessages })
      .from(tenants).innerJoin(plans, eq(plans.id, tenants.planId)).where(eq(tenants.id, item.tenantId)).limit(1);
    const reminder = item.templateType === "reminder_eve" || item.templateType === "reminder_2h";
    const enabled = item.templateType === "booking_created" ? data.settings?.bookingCreated ?? true : item.templateType === "rescheduled" ? data.settings?.rescheduled ?? true : item.templateType === "canceled" ? data.settings?.canceled ?? true : item.templateType === "reminder_eve" ? data.settings?.reminderEve ?? true : (data.settings?.reminder2h ?? false) && ["profissional", "studio"].includes(tenant?.planCode ?? "");
    const invalid = !tenant || !isTenantActive(tenant, now) || !data.booking || !enabled || (reminder && (data.booking.status !== "scheduled" && data.booking.status !== "confirmed" || item.eventKey !== data.booking.startsAt.toISOString()));
    if (invalid) {
      await withTenantTx(tx, item.tenantId, (t) => t.update(whatsappQueue).set({ processedAt: now, errorMessage: "Agendamento indisponível ou alterado." }).where(eq(whatsappQueue.id, item.id)));
      return { skipped: true as const };
    }
    const booking = data.booking!;
    const monthStart = `${localDateOf(now, tenant!.timezone).slice(0, 7)}-01`;
    const nextMonth = `${addDaysToDate(`${monthStart.slice(0, 7)}-28`, 4).slice(0, 7)}-01`;
    const start = zonedInstant(monthStart, 0, tenant!.timezone);
    const end = zonedInstant(nextMonth, 0, tenant!.timezone);
    const counted = sql`${whatsappMessages.direction} = 'outbound' and ${whatsappMessages.status} in ('sending','sent','delivered','read')`;
    const [usage] = await tx.select({ n: sql<number>`count(*)::int` }).from(whatsappMessages).where(and(eq(whatsappMessages.tenantId, item.tenantId), counted, gte(whatsappMessages.createdAt, start), sql`${whatsappMessages.createdAt} < ${end}`));
    const [daily] = await tx.select({ n: sql<number>`count(distinct ${whatsappMessages.recipientPhone})::int`, already: sql<boolean>`coalesce(bool_or(${whatsappMessages.recipientPhone} = ${booking.phone}), false)` })
      .from(whatsappMessages).where(and(counted, gte(whatsappMessages.createdAt, new Date(now.getTime() - 86_400_000)), lte(whatsappMessages.createdAt, now)));
    if (usage.n >= (tenant!.status === "trial" ? 50 : tenant!.limit) || (daily.n >= 250 && !daily.already)) {
      await withTenantTx(tx, item.tenantId, (t) => t.update(whatsappQueue).set({ processedAt: now, errorMessage: "quota_exceeded" }).where(eq(whatsappQueue.id, item.id)));
      return { skipped: true as const };
    }
    const [message] = await withTenantTx(tx, item.tenantId, async (t) => {
      await t.update(whatsappQueue).set({ lockedUntil: CLAIM_UNTIL, attempts: item.attempts + 1 }).where(eq(whatsappQueue.id, item.id));
      return t.insert(whatsappMessages).values({ tenantId: item.tenantId, bookingId: item.bookingId, recipientPhone: booking.phone, recipientName: booking.customerName, templateType: item.templateType, status: "sending", createdAt: now }).returning({ id: whatsappMessages.id });
    });
    return { skipped: false as const, item, booking, tenant: tenant!, serviceName: data.services.map((s) => s.name).join(", "), messageId: message.id };
  });
}

/** Worker privilegiado: reserva antes do envio e retém casos incertos para revisão. */
export async function processQueue(db: Db, maxBatch = 20, now: Date = new Date()) {
  const summary = { processed: 0, sent: 0, failed: 0 };
  for (let i = 0; i < Math.max(0, Math.min(maxBatch, 100)); i++) {
    const reserved = await reserveNext(db, now);
    if (!reserved) break;
    summary.processed++;
    if (reserved.skipped) { summary.failed++; continue; }
    const { item, booking, tenant, messageId, serviceName } = reserved;
    try {
      const expiresAt = new Date(Math.max(now.getTime() + 7 * 86_400_000, booking.startsAt.getTime() + 86_400_000));
      const token = await issueAdditionalManageToken(db, item.tenantId, item.bookingId, expiresAt);
      const payload = buildTemplatePayload(item.templateType, { customerName: booking.customerName, tenantName: tenant.name, serviceName, professionalName: booking.professionalName, startsAt: booking.startsAt, timezone: tenant.timezone, manageUrl: `${appUrl()}/agendamento/${encodeURIComponent(token)}`, bookingId: booking.id, manageToken: token });
      const sent = await getWhatsAppChannel().sendTemplate(booking.phone, payload);
      if (!sent.ok) throw new Error("Envio com resultado incerto.");
      await withTenant(db, item.tenantId, async (tx) => {
        await tx.update(whatsappMessages).set({ status: "sent", wamId: sent.wamId, sentAt: now }).where(eq(whatsappMessages.id, messageId));
        await tx.update(whatsappQueue).set({ processedAt: now, lockedUntil: null }).where(eq(whatsappQueue.id, item.id));
      });
      summary.sent++;
    } catch (error) {
      // Não reenvia: o serviço pode ter aceitado a mensagem antes de falhar a resposta.
      await withTenant(db, item.tenantId, (tx) => tx.update(whatsappQueue).set({ errorMessage: "Envio incerto; requer revisão." }).where(eq(whatsappQueue.id, item.id)));
      console.error("Falha ao processar mensagem WhatsApp", error instanceof Error ? error.name : "erro desconhecido");
      summary.failed++;
    }
  }
  return summary;
}
