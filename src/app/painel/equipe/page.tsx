import { eq } from "drizzle-orm";
import type { Metadata } from "next";
import { getDb } from "@/db/client";
import { tenants } from "@/db/schema";
import { professionalPhotoUrl } from "@/server/media";
import { ProfessionalsScreen } from "@/components/catalog/professionals-screen";
import { requirePanelRole } from "@/server/panel/roles";
import { listProfessionals, listServices } from "@/server/catalog";
import { getBusinessHours } from "@/server/settings";
import { professionalIdsWithAccess } from "@/server/team/members";

export const metadata: Metadata = { title: "Equipe" };

export default async function EquipePage() {
  const { session } = await requirePanelRole(["owner", "reception"]);
  const db = await getDb();
  const [tenant] = await db
    .select({ slug: tenants.slug })
    .from(tenants)
    .where(eq(tenants.id, session.tenantId))
    .limit(1);
  const [professionals, services, businessHours, withAccess] = await Promise.all([
    listProfessionals(db, session.tenantId),
    listServices(db, session.tenantId),
    getBusinessHours(db, session.tenantId),
    professionalIdsWithAccess(db, session.tenantId),
  ]);

  return (
    <ProfessionalsScreen
      professionals={professionals.map((p) => ({
        id: p.id,
        name: p.name,
        title: p.title,
        photoUrl:
          tenant && p.photoVersion !== null
            ? professionalPhotoUrl(tenant.slug, p.id, new Date(p.photoVersion))
            : null,
        color: p.color,
        active: p.active,
        serviceIds: p.serviceIds,
        hours: p.hours,
        futureBookings: p.futureBookings,
        hasAccess: withAccess.has(p.id),
      }))}
      services={services.map((s) => ({ id: s.id, name: s.name }))}
      businessHours={businessHours}
      canEdit={session.role === "owner"}
    />
  );
}
