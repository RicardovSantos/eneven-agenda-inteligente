import { and, eq } from "drizzle-orm";
import { billingInvoices, bookingServices, bookings, businessHours, customers, invitations, memberships, professionalHours, professionalServices, professionals, services, tenantLogos, tenantNotificationSettings, tenants, timeBlocks, users, whatsappMessages } from "@/db/schema";
import type { Db } from "@/db/types";
import { withTenantTx } from "@/server/tenant-db";

const MAX_ROWS = 50_000;

/** Exportação delimitada ao estabelecimento, sem tokens, sessões ou credenciais. */
export async function exportTenantAgenda(db: Db, actor: { userId: string; tenantId: string }) {
  const { tenantId, userId } = actor;
  return db.transaction(async (tx) => {
    const [member] = await tx.select({ role: memberships.role }).from(memberships).where(and(eq(memberships.userId, userId), eq(memberships.tenantId, tenantId))).limit(1);
    if (member?.role !== "owner") throw new Error("Acesso indisponível.");
    const members = await tx.select({ id: users.id, name: users.name, email: users.email, role: memberships.role }).from(memberships).innerJoin(users, eq(users.id, memberships.userId)).where(eq(memberships.tenantId, tenantId)).limit(MAX_ROWS + 1);
    return withTenantTx(tx, tenantId, async (t) => {
    const [tenant] = await t.select({ name: tenants.name, slug: tenants.slug, timezone: tenants.timezone, whatsapp: tenants.whatsapp, address: tenants.address, instagram: tenants.instagram, about: tenants.about, brandColor: tenants.brandColor, slotIntervalMin: tenants.slotIntervalMin, minNoticeMin: tenants.minNoticeMin, maxDaysAhead: tenants.maxDaysAhead, cancelWindowMin: tenants.cancelWindowMin }).from(tenants).where(eq(tenants.id, tenantId)).limit(1);
    if (!tenant) throw new Error("Estabelecimento indisponível.");
    const clientRows = await t.select({ id: customers.id, name: customers.name, phone: customers.phone, email: customers.email, notes: customers.notes, createdAt: customers.createdAt }).from(customers).where(eq(customers.tenantId, tenantId)).limit(MAX_ROWS + 1);
    const bookingRows = await t.select({ id: bookings.id, customerId: bookings.customerId, professionalId: bookings.professionalId, startsAt: bookings.startsAt, endsAt: bookings.endsAt, status: bookings.status, source: bookings.source, totalCents: bookings.totalCents, notes: bookings.notes, canceledAt: bookings.canceledAt, createdAt: bookings.createdAt, updatedAt: bookings.updatedAt }).from(bookings).where(eq(bookings.tenantId, tenantId)).limit(MAX_ROWS + 1);
    const bookingServiceRows = await t.select({ bookingId: bookingServices.bookingId, serviceId: bookingServices.serviceId, name: bookingServices.name, durationMin: bookingServices.durationMin, priceCents: bookingServices.priceCents, position: bookingServices.position }).from(bookingServices).where(eq(bookingServices.tenantId, tenantId)).limit(MAX_ROWS + 1);
    const serviceRows = await t.select({ id: services.id, name: services.name, description: services.description, durationMin: services.durationMin, bufferAfterMin: services.bufferAfterMin, priceCents: services.priceCents, visible: services.visible, archivedAt: services.archivedAt }).from(services).where(eq(services.tenantId, tenantId)).limit(MAX_ROWS + 1);
    const professionalRows = await t.select({ id: professionals.id, name: professionals.name, active: professionals.active, color: professionals.color }).from(professionals).where(eq(professionals.tenantId, tenantId)).limit(MAX_ROWS + 1);
    const hours = await t.select({ weekday: businessHours.weekday, startsAt: businessHours.startsAt, endsAt: businessHours.endsAt }).from(businessHours).where(eq(businessHours.tenantId, tenantId)).limit(MAX_ROWS + 1);
    const teamHours = await t.select({ professionalId: professionalHours.professionalId, weekday: professionalHours.weekday, startsAt: professionalHours.startsAt, endsAt: professionalHours.endsAt }).from(professionalHours).where(eq(professionalHours.tenantId, tenantId)).limit(MAX_ROWS + 1);
    const teamServices = await t.select({ professionalId: professionalServices.professionalId, serviceId: professionalServices.serviceId }).from(professionalServices).where(eq(professionalServices.tenantId, tenantId)).limit(MAX_ROWS + 1);
    const blocks = await t.select({ professionalId: timeBlocks.professionalId, startsAt: timeBlocks.startsAt, endsAt: timeBlocks.endsAt, reason: timeBlocks.reason }).from(timeBlocks).where(eq(timeBlocks.tenantId, tenantId)).limit(MAX_ROWS + 1);
    const invites = await t.select({ name: invitations.name, email: invitations.email, role: invitations.role, professionalId: invitations.professionalId, expiresAt: invitations.expiresAt, acceptedAt: invitations.acceptedAt, revokedAt: invitations.revokedAt, createdAt: invitations.createdAt }).from(invitations).where(eq(invitations.tenantId, tenantId)).limit(MAX_ROWS + 1);
    const messages = await t.select({ bookingId: whatsappMessages.bookingId, direction: whatsappMessages.direction, templateType: whatsappMessages.templateType, recipientPhone: whatsappMessages.recipientPhone, recipientName: whatsappMessages.recipientName, status: whatsappMessages.status, sentAt: whatsappMessages.sentAt, deliveredAt: whatsappMessages.deliveredAt, readAt: whatsappMessages.readAt, createdAt: whatsappMessages.createdAt }).from(whatsappMessages).where(eq(whatsappMessages.tenantId, tenantId)).limit(MAX_ROWS + 1);
    const invoices = await t.select({ status: billingInvoices.providerStatus, amountCents: billingInvoices.amountCents, dueAt: billingInvoices.dueAt, paidAt: billingInvoices.paidAt, createdAt: billingInvoices.createdAt }).from(billingInvoices).where(eq(billingInvoices.tenantId, tenantId)).limit(MAX_ROWS + 1);
    const [logo] = await t.select({ mime: tenantLogos.mime, data: tenantLogos.data }).from(tenantLogos).where(eq(tenantLogos.tenantId, tenantId)).limit(1);
    const [notifications] = await t.select({ bookingCreated: tenantNotificationSettings.bookingCreated, reminderEve: tenantNotificationSettings.reminderEve, reminder2h: tenantNotificationSettings.reminder2h, rescheduled: tenantNotificationSettings.rescheduled, canceled: tenantNotificationSettings.canceled }).from(tenantNotificationSettings).where(eq(tenantNotificationSettings.tenantId, tenantId)).limit(1);
    if ([members, clientRows, bookingRows, bookingServiceRows, serviceRows, professionalRows, hours, teamHours, teamServices, blocks, invites, messages, invoices].some((rows) => rows.length > MAX_ROWS)) throw new Error("A exportação excede o limite disponível. Entre em contato com o suporte.");
    return { version: 3, establishment: tenant, logo: logo ? { mime: logo.mime, base64: Buffer.from(logo.data).toString("base64") } : null, members, invitations: invites, customers: clientRows, bookings: bookingRows, bookingServices: bookingServiceRows, services: serviceRows, professionals: professionalRows, businessHours: hours, professionalHours: teamHours, professionalServices: teamServices, timeBlocks: blocks, notificationPreferences: notifications ?? null, whatsappMessages: messages, invoices };
    });
  }, { isolationLevel: "repeatable read", accessMode: "read only" });
}
