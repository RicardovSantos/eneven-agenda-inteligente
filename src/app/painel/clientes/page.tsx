import type { Metadata } from "next";
import { getDb } from "@/db/client";
import { ClientList } from "@/components/clients/client-list";
import { ClientsLayout, EmptyProfile } from "@/components/clients/clients-layout";
import { PUBLIC_HOST } from "@/lib/brand";
import { requireOnboarded } from "@/server/panel/onboarding-gate";
import { isTenantReleased } from "@/server/tenants/release";
import { loadClientListProps, parseClientsQuery } from "./list-data";

export const metadata: Metadata = { title: "Clientes" };

export default async function ClientesPage({ searchParams }: PageProps<"/painel/clientes">) {
  const data = await requireOnboarded();
  const { session } = data;
  const query = parseClientsQuery(await searchParams);
  const released = isTenantReleased({
    status: data.tenantStatus,
    trialEndsAt: data.trialEndsAt,
    pastDueAt: data.pastDueAt,
    emailVerified: data.linkEmailVerified,
  });

  const props = await loadClientListProps(
    await getDb(),
    { tenantId: session.tenantId, userId: session.userId, role: session.role! },
    query,
    { timezone: data.timezone, publicUrl: released ? `https://${PUBLIC_HOST}/${data.tenantSlug}` : null },
  );

  return <ClientsLayout hasSelection={false} list={<ClientList {...props} />} aside={<EmptyProfile />} />;
}
