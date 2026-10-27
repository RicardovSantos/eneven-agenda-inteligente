import { and, asc, desc, eq, inArray, isNotNull, isNull, lt, sql } from "drizzle-orm";
import { bookingServices, bookings, customers, professionals, tenants } from "@/db/schema";
import type { Db } from "@/db/types";
import { customerMatch } from "@/server/agenda/customer-search";
import { staffProfessionalId, type PanelActor } from "@/server/agenda/panel-ops";
import { localDateOf } from "@/server/agenda/time";
import { withTenant, type TenantTx } from "@/server/tenant-db";
import { ClientError } from "./errors";

export type ClientFilter = "all" | "upcoming" | "lapsed";
export type BookingStatus = (typeof bookings.$inferSelect)["status"];

export const LAPSED_DAYS = 60;
export const CLIENTS_PAGE_SIZE = 50;
const HISTORY_LIMIT = 5;

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const DAY_MS = 86_400_000;

export type ClientListItem = {
  id: string;
  name: string;
  phone: string;
  /** Atendimentos concluídos. */
  visits: number;
  /** Soma dos atendimentos concluídos, em centavos. `null` para `staff` (sem receita). */
  totalCents: number | null;
  noShows: number;
  lastVisitAt: Date | null;
  nextBookingAt: Date | null;
};

export type ClientProfile = ClientListItem & {
  email: string | null;
  notes: string | null;
  createdAt: Date;
  returnEveryDays: number | null;
  history: Array<{
    bookingId: string;
    startsAt: Date;
    services: string[];
    professionalName: string;
    status: BookingStatus;
    totalCents: number;
  }>;
  historyTotal: number;
};

const notFound = () => new ClientError("not_found");

/**
 * Agregados por cliente numa única consulta (`group by customer_id`).
 * Canceladas ficam fora de tudo; só `completed` conta visita/receita/última
 * visita, `scheduled|confirmed` futuros dão o próximo horário. Com `own`
 * (staff), só os agendamentos daquele profissional entram, e quem não tem
 * nenhum nem aparece no resultado.
 */
function bookingAggregates(tx: TenantTx, tenantId: string, own: string | null, now: Date, customerId?: string) {
  const nowSql = sql`${now.toISOString()}::timestamptz`;
  return tx
    .select({
      customerId: bookings.customerId,
      visits: sql<number>`count(*) filter (where ${bookings.status} = 'completed')`.mapWith(Number).as("visits"),
      totalCents: sql<number>`coalesce(sum(${bookings.totalCents}) filter (where ${bookings.status} = 'completed'), 0)`
        .mapWith(Number)
        .as("total_cents"),
      noShows: sql<number>`count(*) filter (where ${bookings.status} = 'no_show')`.mapWith(Number).as("no_shows"),
      lastVisitAt: sql<Date | null>`max(${bookings.startsAt}) filter (where ${bookings.status} = 'completed')`
        .mapWith(bookings.startsAt)
        .as("last_visit_at"),
      nextBookingAt: sql<Date | null>`min(${bookings.startsAt}) filter (where ${bookings.status} in ('scheduled', 'confirmed') and ${bookings.startsAt} >= ${nowSql})`
        .mapWith(bookings.startsAt)
        .as("next_booking_at"),
    })
    .from(bookings)
    .where(
      and(
        eq(bookings.tenantId, tenantId),
        own ? eq(bookings.professionalId, own) : undefined,
        customerId ? eq(bookings.customerId, customerId) : undefined,
      ),
    )
    .groupBy(bookings.customerId)
    .as("agg");
}

type Agg = ReturnType<typeof bookingAggregates>;

function toListItem(
  row: {
    id: string;
    name: string;
    phone: string;
    visits: number | null;
    totalCents: number | null;
    noShows: number | null;
    lastVisitAt: Date | null;
    nextBookingAt: Date | null;
  },
  revenue: boolean,
): ClientListItem {
  return {
    id: row.id,
    name: row.name,
    phone: row.phone,
    visits: row.visits ?? 0,
    totalCents: revenue ? (row.totalCents ?? 0) : null,
    noShows: row.noShows ?? 0,
    lastVisitAt: row.lastVisitAt,
    nextBookingAt: row.nextBookingAt,
  };
}

const aggFields = (agg: Agg) => ({
  visits: agg.visits,
  totalCents: agg.totalCents,
  noShows: agg.noShows,
  lastVisitAt: agg.lastVisitAt,
  nextBookingAt: agg.nextBookingAt,
});

export async function listClients(
  db: Db,
  actor: PanelActor,
  input: { query?: string; filter: ClientFilter; page: number; now?: Date },
): Promise<{ items: ClientListItem[]; total: number; hasMore: boolean }> {
  const now = input.now ?? new Date();
  const own = await staffProfessionalId(db, actor);
  const page = Number.isInteger(input.page) && input.page > 0 ? input.page : 1;
  const query = input.query?.trim() ?? "";
  const lapsedBefore = new Date(now.getTime() - LAPSED_DAYS * DAY_MS);

  return withTenant(db, actor.tenantId, async (tx) => {
    const agg = bookingAggregates(tx, actor.tenantId, own, now);
    const where = and(
      eq(customers.tenantId, actor.tenantId),
      query ? customerMatch(query) : undefined,
      own ? isNotNull(agg.customerId) : undefined,
      input.filter === "upcoming" ? isNotNull(agg.nextBookingAt) : undefined,
      input.filter === "lapsed" ? and(lt(agg.lastVisitAt, lapsedBefore), isNull(agg.nextBookingAt)) : undefined,
    );
    const join = eq(agg.customerId, customers.id);

    const rows = await tx
      .select({ id: customers.id, name: customers.name, phone: customers.phone, ...aggFields(agg) })
      .from(customers)
      .leftJoin(agg, join)
      .where(where)
      .orderBy(asc(customers.name), asc(customers.id))
      .limit(CLIENTS_PAGE_SIZE)
      .offset((page - 1) * CLIENTS_PAGE_SIZE);
    const [count] = await tx
      .select({ total: sql<number>`count(*)`.mapWith(Number) })
      .from(customers)
      .leftJoin(agg, join)
      .where(where);
    return {
      items: rows.map((r) => toListItem(r, own === null)),
      total: count.total,
      hasMore: page * CLIENTS_PAGE_SIZE < count.total,
    };
  });
}

/**
 * Intervalo médio de retorno: média arredondada (Math.round) das diferenças em
 * dias de CALENDÁRIO no fuso do estabelecimento entre atendimentos concluídos
 * consecutivos (23h30 e 00h30 locais contam 1 dia, não 0).
 */
function averageReturnDays(starts: Date[], timezone: string): number | null {
  if (starts.length < 2) return null;
  const days = starts.map((d) => Date.parse(`${localDateOf(d, timezone)}T00:00:00Z`) / DAY_MS);
  let sum = 0;
  for (let i = 1; i < days.length; i++) sum += days[i] - days[i - 1];
  return Math.round(sum / (days.length - 1));
}

export async function getClientProfile(
  db: Db,
  actor: PanelActor,
  clientId: string,
  opts: { historyLimit?: number; now?: Date } = {},
): Promise<ClientProfile> {
  if (!UUID.test(clientId)) throw notFound();
  const now = opts.now ?? new Date();
  const limit = Math.max(1, Math.floor(opts.historyLimit ?? HISTORY_LIMIT));
  const own = await staffProfessionalId(db, actor);
  const scope = and(
    eq(bookings.tenantId, actor.tenantId),
    eq(bookings.customerId, clientId),
    own ? eq(bookings.professionalId, own) : undefined,
  );

  return withTenant(db, actor.tenantId, async (tx) => {
    const agg = bookingAggregates(tx, actor.tenantId, own, now, clientId);
    const [row] = await tx
      .select({
        id: customers.id,
        name: customers.name,
        phone: customers.phone,
        email: customers.email,
        notes: customers.notes,
        createdAt: customers.createdAt,
        timezone: tenants.timezone,
        hasAgg: isNotNull(agg.customerId),
        ...aggFields(agg),
      })
      .from(customers)
      .innerJoin(tenants, eq(tenants.id, customers.tenantId))
      .leftJoin(agg, eq(agg.customerId, customers.id))
      .where(and(eq(customers.tenantId, actor.tenantId), eq(customers.id, clientId)))
      .limit(1);
    // Fora do escopo do staff = sem agendamento dele com o cliente.
    if (!row || (own !== null && !row.hasAgg)) throw notFound();

    const completed = await tx
      .select({ startsAt: bookings.startsAt })
      .from(bookings)
      .where(and(scope, eq(bookings.status, "completed")))
      .orderBy(asc(bookings.startsAt));
    const historyRows = await tx
      .select({
        bookingId: bookings.id,
        startsAt: bookings.startsAt,
        status: bookings.status,
        totalCents: bookings.totalCents,
        professionalName: professionals.name,
      })
      .from(bookings)
      .innerJoin(
        professionals,
        and(eq(professionals.tenantId, bookings.tenantId), eq(professionals.id, bookings.professionalId)),
      )
      .where(scope)
      .orderBy(desc(bookings.startsAt), desc(bookings.id))
      .limit(limit);
    const [count] = await tx
      .select({ total: sql<number>`count(*)`.mapWith(Number) })
      .from(bookings)
      .where(scope);

    const lines = historyRows.length
      ? await tx
          .select({ bookingId: bookingServices.bookingId, name: bookingServices.name })
          .from(bookingServices)
          .where(
            and(
              eq(bookingServices.tenantId, actor.tenantId),
              inArray(
                bookingServices.bookingId,
                historyRows.map((h) => h.bookingId),
              ),
            ),
          )
          .orderBy(asc(bookingServices.position))
      : [];

    return {
      ...toListItem(row, own === null),
      email: row.email,
      notes: row.notes,
      createdAt: row.createdAt,
      returnEveryDays: averageReturnDays(
        completed.map((c) => c.startsAt),
        row.timezone,
      ),
      history: historyRows.map((h) => ({
        ...h,
        services: lines.filter((l) => l.bookingId === h.bookingId).map((l) => l.name),
      })),
      historyTotal: count.total,
    };
  });
}
