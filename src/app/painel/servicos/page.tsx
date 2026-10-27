import type { Metadata } from "next";
import { getDb } from "@/db/client";
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
  const [services, professionals] = await Promise.all([
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
    archived: s.archivedAt !== null,
    professionalIds: s.professionalIds,
  }));
  const options: ProfessionalOption[] = professionals.map((p) => ({
    id: p.id,
    name: p.name,
    color: p.color,
    active: p.active,
  }));

  return (
    <ServicesScreen services={items} professionals={options} canEdit={session.role === "owner"} />
  );
}
