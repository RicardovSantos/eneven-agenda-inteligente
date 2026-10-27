import type { Metadata } from "next";
import { getDb } from "@/db/client";
import { DayBars } from "@/components/dashboard/day-bars";
import { MonthSwitcher } from "@/components/dashboard/month-switcher";
import { PendingReview, type PendingItem } from "@/components/dashboard/pending-review";
import { PerProfessional } from "@/components/dashboard/per-professional";
import { StatTiles } from "@/components/dashboard/stat-tiles";
import { TopServices } from "@/components/dashboard/top-services";
import { PUBLIC_HOST } from "@/lib/brand";
import { parseMonthParam } from "@/lib/dashboard-view";
import { formatShortDate, formatTime } from "@/lib/dates";
import { localDateOf } from "@/server/agenda/time";
import { getDashboard, listPendingOutcomes } from "@/server/dashboard";
import { requirePanelRole } from "@/server/panel/roles";
import { isTenantReleased } from "@/server/tenants/release";

export const metadata: Metadata = { title: "Visão geral" };

export default async function VisaoGeralPage({ searchParams }: PageProps<"/painel/visao-geral">) {
  const data = await requirePanelRole(["owner"]);
  const { session, timezone } = data;
  const now = new Date();
  const today = localDateOf(now, timezone);
  const month = parseMonthParam((await searchParams).mes, today.slice(0, 7));

  const db = await getDb();
  const [dashboard, pending] = await Promise.all([
    getDashboard(db, { tenantId: session.tenantId, month, timezone, now }),
    listPendingOutcomes(db, session.tenantId, now),
  ]);

  const released = isTenantReleased({
    status: data.tenantStatus,
    trialEndsAt: data.trialEndsAt,
    emailVerified: session.emailVerified,
  });
  const items: PendingItem[] = pending.map((p) => ({
    id: p.bookingId,
    when: `${formatShortDate(localDateOf(p.startsAt, timezone))} · ${formatTime(p.startsAt, timezone)}`,
    customer: p.customerName,
    services: p.services.join(", "),
  }));

  return (
    <div className="mx-auto flex w-full max-w-[1208px] flex-col gap-3 lg:gap-5">
      {/* Cabeçalho: faixa branca no celular, solto no computador */}
      <header className="-mx-4 -mt-6 flex flex-col gap-2.5 border-b border-line bg-surface px-4 pb-3 pt-4 lg:m-0 lg:flex-row lg:flex-wrap lg:items-center lg:justify-between lg:gap-4 lg:border-0 lg:bg-transparent lg:p-0">
        <div className="flex flex-col gap-1">
          <h1 className="font-display text-[1.375rem] font-semibold lg:text-[1.75rem]">Visão geral</h1>
          <p className="hidden text-sm text-ink-muted lg:block">
            Como o seu mês está indo, atualizado a cada agendamento.
          </p>
        </div>
        <MonthSwitcher month={month} />
      </header>

      <PendingReview items={items} />
      <StatTiles data={dashboard} />
      <DayBars
        days={dashboard.perDay}
        month={month}
        today={today}
        publicUrl={released ? `https://${PUBLIC_HOST}/${data.tenantSlug}` : null}
      />
      <div className="grid gap-3 lg:grid-cols-[repeat(auto-fit,minmax(340px,1fr))] lg:gap-4">
        <TopServices services={dashboard.topServices} />
        <PerProfessional professionals={dashboard.perProfessional} />
      </div>
    </div>
  );
}
