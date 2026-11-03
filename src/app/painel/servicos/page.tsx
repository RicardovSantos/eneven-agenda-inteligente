import type { Metadata } from "next";
import { eq } from "drizzle-orm";
import { getDb } from "@/db/client";
import { tenants } from "@/db/schema";
import { professionalPhotoUrl } from "@/server/media";
import {
  ServicesScreen,
  type ProfessionalOption,
  type ServiceItem,
} from "@/components/catalog/services-screen";
import { requirePanelRole } from "@/server/panel/roles";
import { listProfessionals, listServices } from "@/server/catalog";

export const metadata: Metadata = { title: "Serviços" };

export default async function ServicosPage() {
  const { session } = await requirePanelRole(["owner", "reception"]);
  const db = await getDb();
  const [[tenant], services, professionals] = await Promise.all([
    db.select({ slug: tenants.slug }).from(tenants).where(eq(tenants.id, session.tenantId)).limit(1),
    listServices(db, session.tenantId, { includeArchived: true }),
    listProfessionals(db, session.tenantId),
  ]);

  const items: ServiceItem[] = services.map((s) => ({
    id: s.id,
    name: s.name,
    description: s.description,
    durationMin: s.durationMin,
    bufferAfterMin: s.bufferAfterMin,
    priceCents: s.priceCents,
    visible: s.visible,
    categoryName: s.categoryName,
    archived: s.archivedAt !== null,
    professionalIds: s.professionalIds,
  }));
  const options: ProfessionalOption[] = professionals.map((p) => ({
    id: p.id,
    name: p.name,
    color: p.color,
    photoUrl:
      tenant && p.photoVersion !== null
        ? professionalPhotoUrl(tenant.slug, p.id, new Date(p.photoVersion))
        : null,
    active: p.active,
  }));

  return (
    <ServicesScreen services={items} professionals={options} canEdit={session.role === "owner"} />
  );
}
