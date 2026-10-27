import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getDb } from "@/db/client";
import type { Db } from "@/db/types";
import { ClientList } from "@/components/clients/client-list";
import { ClientProfile, type BookingOptions } from "@/components/clients/client-profile";
import { ClientsLayout } from "@/components/clients/clients-layout";
import { clientsHref, toProfileView } from "@/components/clients/view";
import { PUBLIC_HOST } from "@/lib/brand";
import { findStaffProfessional, listPanelProfessionals } from "@/server/agenda/panel-queries";
import { panelBookingOptions } from "@/server/agenda/booking-options";
import { localDateOf } from "@/server/agenda/time";
import { listServices } from "@/server/catalog";
import { ClientError, getClientProfile } from "@/server/clients";
import { requireOnboarded } from "@/server/panel/onboarding-gate";
import { isTenantReleased } from "@/server/tenants/release";
import { loadClientListProps, parseClientsQuery } from "../list-data";

export const metadata: Metadata = { title: "Cliente" };

/** "Ver todos": a ficha mostra até este tanto de atendimentos. */
const FULL_HISTORY = 200;

export default async function ClientePage({ params, searchParams }: PageProps<"/painel/clientes/[id]">) {
  const data = await requireOnboarded();
  const { session } = data;
  const { id } = await params;
  const rawSearch = await searchParams;
  const query = parseClientsQuery(rawSearch);
  const fullHistory = rawSearch.historico === "todos";
  const db = await getDb();
  const actor = { tenantId: session.tenantId, userId: session.userId, role: session.role! };

  const profile = await getClientProfile(db, actor, id, fullHistory ? { historyLimit: FULL_HISTORY } : {}).catch(
    (error: unknown) => {
      if (error instanceof ClientError && error.code === "not_found") notFound();
      throw error;
    },
  );

  const released = isTenantReleased({
    status: data.tenantStatus,
    trialEndsAt: data.trialEndsAt,
    emailVerified: session.emailVerified,
  });
  const [list, booking] = await Promise.all([
    loadClientListProps(db, actor, query, {
      timezone: data.timezone,
      publicUrl: released ? `https://${PUBLIC_HOST}/${data.tenantSlug}` : null,
      selectedId: id,
    }),
    loadBookingOptions(db, data),
  ]);

  const view = toProfileView(profile, data.timezone);
  const keep = { q: query.q || undefined, filtro: query.filtro, pagina: query.pagina };
  return (
    <ClientsLayout
      hasSelection
      list={<ClientList {...list} />}
      aside={
        <ClientProfile
          key={view.id}
          profile={view}
          canEdit={session.role !== "staff"}
          listHref={clientsHref(keep)}
          allHistoryHref={
            view.historyTotal > view.history.length ? clientsHref({ id, ...keep, historico: true }) : null
          }
          booking={booking}
        />
      }
    />
  );
}

/** O que o "Novo agendamento" precisa (mesma regra da agenda: `staff` só os próprios serviços). */
async function loadBookingOptions(
  db: Db,
  data: Awaited<ReturnType<typeof requireOnboarded>>,
): Promise<BookingOptions | null> {
  const { session } = data;
  const [allPros, catalog] = await Promise.all([
    listPanelProfessionals(db, session.tenantId),
    listServices(db, session.tenantId),
  ]);
  const own = session.role === "staff" ? await findStaffProfessional(db, session.tenantId, session.userId) : null;
  if (session.role === "staff" && !own) return null;

  const { professionals, services } = panelBookingOptions(allPros, catalog, own);
  if (services.length === 0) return null;
  return {
    today: localDateOf(new Date(), data.timezone),
    timezone: data.timezone,
    services,
    professionals,
    lockedProfessionalId: own?.id ?? null,
  };
}
