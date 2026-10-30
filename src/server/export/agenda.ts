import { and, eq } from "drizzle-orm";
import { bookingServices, bookings, customers, memberships, professionals, services, tenants } from "@/db/schema";
import type { Db } from "@/db/types";
import { withTenantTx } from "@/server/tenant-db";

const MAX_ROWS = 50_000;

/** Exportação delimitada ao estabelecimento, sem tokens, sessões ou credenciais. */
export async function exportTenantAgenda(db: Db, actor: { userId: string; tenantId: string }) {
  const { tenantId, userId } = actor;
  return db.transaction(async (tx) => {
    const [member] = await tx.select({ role: memberships.role }).from(memberships).where(and(eq(memberships.userId, userId), eq(memberships.tenantId, tenantId))).limit(1);
    if (member?.role !== "owner") throw new Error("Acesso indisponível.");
    return withTenantTx(tx, tenantId, async (t) => {
    const [tenant] = await t.select({ name: tenants.name, slug: tenants.slug, timezone: tenants.timezone, whatsapp: tenants.whatsapp, address: tenants.address, instagram: tenants.instagram, about: tenants.about }).from(tenants).where(eq(tenants.id, tenantId)).limit(1);
    if (!tenant) throw new Error("Estabelecimento indisponível.");
    const clientRows = await t.select({ id: customers.id, name: customers.name, phone: customers.phone, email: customers.email, notes: customers.notes, createdAt: customers.createdAt }).from(customers).where(eq(customers.tenantId, tenantId)).limit(MAX_ROWS + 1);
    const bookingRows = await t.select({ id: bookings.id, customerId: bookings.customerId, professionalId: bookings.professionalId, startsAt: bookings.startsAt, endsAt: bookings.endsAt, status: bookings.status, source: bookings.source, totalCents: bookings.totalCents, notes: bookings.notes, canceledAt: bookings.canceledAt, createdAt: bookings.createdAt, updatedAt: bookings.updatedAt }).from(bookings).where(eq(bookings.tenantId, tenantId)).limit(MAX_ROWS + 1);
    const bookingServiceRows = await t.select({ bookingId: bookingServices.bookingId, serviceId: bookingServices.serviceId, name: bookingServices.name, durationMin: bookingServices.durationMin, priceCents: bookingServices.priceCents, position: bookingServices.position }).from(bookingServices).where(eq(bookingServices.tenantId, tenantId)).limit(MAX_ROWS + 1);
    const serviceRows = await t.select({ id: services.id, name: services.name, description: services.description, durationMin: services.durationMin, bufferAfterMin: services.bufferAfterMin, priceCents: services.priceCents, visible: services.visible, archivedAt: services.archivedAt }).from(services).where(eq(services.tenantId, tenantId)).limit(MAX_ROWS + 1);
    const professionalRows = await t.select({ id: professionals.id, name: professionals.name, active: professionals.active, color: professionals.color }).from(professionals).where(eq(professionals.tenantId, tenantId)).limit(MAX_ROWS + 1);
    if ([clientRows, bookingRows, bookingServiceRows, serviceRows, professionalRows].some((rows) => rows.length > MAX_ROWS)) throw new Error("A exportação excede o limite disponível. Entre em contato com o suporte.");
    return { version: 1, establishment: tenant, customers: clientRows, bookings: bookingRows, bookingServices: bookingServiceRows, services: serviceRows, professionals: professionalRows };
    });
  }, { isolationLevel: "repeatable read", accessMode: "read only" });
}
