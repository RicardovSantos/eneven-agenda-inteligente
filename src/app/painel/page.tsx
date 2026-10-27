import type { Metadata } from "next";
import { getDb } from "@/db/client";
import { AgendaScreen } from "@/components/agenda/agenda-screen";
import { ResendVerification } from "@/components/panel/resend-verification";
import { PUBLIC_HOST } from "@/lib/brand";
import { formatDayMonth, trialDaysLeft } from "@/lib/trial";
import { findStaffProfessional, getDayAgenda, getMonthOverview, listPanelProfessionals } from "@/server/agenda/panel-queries";
import { panelBookingOptions } from "@/server/agenda/booking-options";
import { addDaysToDate, localDateOf, weekdayOf } from "@/server/agenda/time";
import { requireOnboarded } from "@/server/panel/onboarding-gate";
import { isTenantActive, isTenantReleased } from "@/server/tenants/release";
import { isRealDate } from "@/server/public/schemas";
import { listServices } from "@/server/catalog";

export const metadata: Metadata = { title: "Agenda" };

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function first(value: string | string[] | undefined): string | undefined {
  return Array.isArray(value) ? value[0] : value;
}

export default async function PainelPage({ searchParams }: PageProps<"/painel">) {
  const data = await requireOnboarded();
  const params = await searchParams;
  const { session } = data;
  const db = await getDb();
  const now = new Date();

  const today = localDateOf(now, data.timezone);
  const dateParam = first(params.data);
  const date = dateParam && isRealDate(dateParam) ? dateParam : today;
  const view = first(params.view) === "dia" ? "dia" : "mes";

  // Profissional (`staff`) só enxerga a própria agenda; os demais podem filtrar.
  const allPros = await listPanelProfessionals(db, session.tenantId);
  const own =
    session.role === "staff" ? await findStaffProfessional(db, session.tenantId, session.userId) : null;
  const banners = <Banners data={data} />;

  if (session.role === "staff" && !own) {
    return (
      <div className="mx-auto flex max-w-md flex-col gap-3 py-16 text-center">
        <h1 className="font-display text-2xl font-semibold">Sua agenda ainda não está ligada</h1>
        <p className="text-ink-muted">
          Peça ao proprietário para ligar o seu usuário a um profissional em Equipe. Depois disso, seus
          agendamentos aparecem aqui.
        </p>
      </div>
    );
  }

  const proParam = first(params.pro);
  const filter = own
    ? own.id
    : proParam && UUID.test(proParam) && allPros.some((p) => p.id === proParam)
      ? proParam
      : "todos";
  const professionalId = filter === "todos" ? undefined : filter;

  const month = date.slice(0, 7);
  const weekStart = addDaysToDate(date, -weekdayOf(date));
  const weekEnd = addDaysToDate(weekStart, 6);
  const otherMonth = [weekStart, weekEnd].map((d) => d.slice(0, 7)).find((m) => m !== month);

  const [monthDays, otherDays, day, catalog] = await Promise.all([
    getMonthOverview(db, session.tenantId, month, professionalId),
    otherMonth ? getMonthOverview(db, session.tenantId, otherMonth, professionalId) : Promise.resolve([]),
    getDayAgenda(db, session.tenantId, date, professionalId),
    listServices(db, session.tenantId),
  ]);

  const { professionals, services } = panelBookingOptions(allPros, catalog, own);

  const released = isTenantReleased({
    status: data.tenantStatus,
    trialEndsAt: data.trialEndsAt,
    emailVerified: data.linkEmailVerified,
  });

  return (
    <AgendaScreen
      today={today}
      date={date}
      view={view}
      professionalFilter={filter}
      monthDays={monthDays}
      stripDays={[...monthDays, ...otherDays]}
      day={day}
      professionals={professionals}
      services={services}
      lockedProfessionalId={own?.id ?? null}
      publicUrl={released ? `https://${PUBLIC_HOST}/${data.tenantSlug}` : null}
      nowMs={now.getTime()}
      readOnly={!isTenantActive({ status: data.tenantStatus, trialEndsAt: data.trialEndsAt }, now)}
      banners={banners}
    />
  );
}

function Banners({ data }: { data: Awaited<ReturnType<typeof requireOnboarded>> }) {
  const isTrial = data.tenantStatus === "trial";
  const daysLeft = trialDaysLeft(data.trialEndsAt);
  if (data.linkEmailVerified && !isTrial) return null;
  return (
    <div className="flex flex-col gap-3">
      {!data.linkEmailVerified ? (
        data.session.support ? (
          // Suporte não dispara e-mail para o dono: só informa.
          <p className="rounded-field border-l-[3px] border-danger bg-danger-soft px-4 py-3 text-sm leading-snug">
            O dono ainda não confirmou o e-mail (
            <strong className="break-all font-semibold">{data.verificationEmail}</strong>): o link de agendamento só é
            liberado depois disso.
          </p>
        ) : (
          <ResendVerification email={data.verificationEmail} />
        )
      ) : null}
      {isTrial ? (
        <p className="rounded-field bg-primary-soft px-4 py-3 text-sm leading-snug text-primary">
          {daysLeft > 0 ? (
            <>
              Seu teste grátis termina em{" "}
              <strong className="font-semibold">
                {daysLeft} {daysLeft === 1 ? "dia" : "dias"}
              </strong>{" "}
              ({formatDayMonth(data.trialEndsAt, data.timezone)}).
            </>
          ) : (
            <>Seu teste grátis terminou.</>
          )}
        </p>
      ) : null}
    </div>
  );
}
