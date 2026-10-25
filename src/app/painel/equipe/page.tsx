import type { Metadata } from "next";
import { getDb } from "@/db/client";
import { ProfessionalsScreen } from "@/components/catalog/professionals-screen";
import { requireTenantSession } from "@/server/auth/guard";
import { listProfessionals, listServices } from "@/server/catalog";
import { getBusinessHours } from "@/server/settings";

export const metadata: Metadata = { title: "Equipe" };

export default async function EquipePage() {
  const session = await requireTenantSession();
  const db = await getDb();
  const [professionals, services, businessHours] = await Promise.all([
    listProfessionals(db, session.tenantId),
    listServices(db, session.tenantId),
    getBusinessHours(db, session.tenantId),
  ]);

  return (
    <ProfessionalsScreen
      professionals={professionals.map((p) => ({
        id: p.id,
        name: p.name,
        color: p.color,
        active: p.active,
        serviceIds: p.serviceIds,
        hours: p.hours,
        futureBookings: p.futureBookings,
      }))}
      services={services.map((s) => ({ id: s.id, name: s.name }))}
      businessHours={businessHours}
      canEdit={session.role === "owner"}
    />
  );
}
