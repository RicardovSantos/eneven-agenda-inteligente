import { formatBRL } from "@/lib/format";
import { formatTime } from "@/lib/dates";
import { buildWhatsAppLink, firstName } from "@/lib/whatsapp";
import { formatBrazilPhone } from "@/lib/phone";
import { localDateOf } from "@/server/agenda/time";
import type { ClientListItem, ClientProfile } from "@/server/clients";

/**
 * Textos prontos das telas de clientes (sem código de servidor além de tipos):
 * a página monta estes modelos no servidor e os componentes só desenham.
 */

const DAY_MS = 86_400_000;

export type ClientFilterParam = "com-horario" | "sem-voltar";

export type ClientsLinkParams = {
  id?: string;
  q?: string;
  filtro?: ClientFilterParam;
  pagina?: number;
  historico?: boolean;
};

/** Endereço da lista ou da ficha, mantendo busca, filtro e páginas. */
export function clientsHref({ id, q, filtro, pagina, historico }: ClientsLinkParams = {}): string {
  const search = new URLSearchParams();
  if (q) search.set("q", q);
  if (filtro) search.set("filtro", filtro);
  if (pagina && pagina > 1) search.set("pagina", String(pagina));
  if (historico) search.set("historico", "todos");
  const qs = search.toString();
  return `/painel/clientes${id ? `/${id}` : ""}${qs ? `?${qs}` : ""}`;
}

export type ClientRow = {
  id: string;
  name: string;
  initials: string;
  phone: string;
  /** Desktop: "06/10/2026" ou "—". */
  last: string;
  /** "Próximo: 28/10 às 14:30" quando há horário marcado. */
  next: string | null;
  /** Celular: "Última visita 20/10", "Sem voltar há 86 dias"... */
  sub: string;
  visits: number;
  visitsLabel: string;
  /** `null` para `staff` (sem receita). */
  total: string | null;
  noShows: number;
};

export function initialsOf(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "?";
  const first = parts[0][0];
  const last = parts.length > 1 ? parts[parts.length - 1][0] : "";
  return (first + last).toUpperCase();
}

/** "2026-10-06" -> "06/10/2026" (ou "06/10" com `short`). */
export function dmy(ymd: string, short = false): string {
  const [y, m, d] = ymd.split("-");
  return short ? `${d}/${m}` : `${d}/${m}/${y}`;
}

function calendarDays(fromYmd: string, toYmd: string): number {
  return Math.round((Date.parse(`${toYmd}T00:00:00Z`) - Date.parse(`${fromYmd}T00:00:00Z`)) / DAY_MS);
}

export function nextLabel(at: Date, timezone: string): string {
  return `Próximo: ${dmy(localDateOf(at, timezone), true)} às ${formatTime(at, timezone)}`;
}

/** Linha de apoio da lista no celular. */
export function clientSub(
  item: Pick<ClientListItem, "lastVisitAt" | "nextBookingAt">,
  now: Date,
  timezone: string,
  lapsedDays: number,
): string {
  if (item.nextBookingAt) return nextLabel(item.nextBookingAt, timezone);
  if (!item.lastVisitAt) return "Ainda sem visitas";
  const last = localDateOf(item.lastVisitAt, timezone);
  const days = calendarDays(last, localDateOf(now, timezone));
  if (days <= 0) return "Última visita hoje";
  if (days >= lapsedDays) return `Sem voltar há ${days} dias`;
  return `Última visita ${dmy(last, true)}`;
}

export function toClientRow(item: ClientListItem, now: Date, timezone: string, lapsedDays: number): ClientRow {
  return {
    id: item.id,
    name: item.name,
    initials: initialsOf(item.name),
    phone: formatBrazilPhone(item.phone),
    last: item.lastVisitAt ? dmy(localDateOf(item.lastVisitAt, timezone)) : "—",
    next: item.nextBookingAt ? nextLabel(item.nextBookingAt, timezone) : null,
    sub: clientSub(item, now, timezone, lapsedDays),
    visits: item.visits,
    visitsLabel: `${item.visits} ${item.visits === 1 ? "visita" : "visitas"}`,
    total: item.totalCents === null ? null : formatBRL(item.totalCents),
    noShows: item.noShows,
  };
}

export type ClientProfileView = {
  id: string;
  name: string;
  initials: string;
  since: string;
  phone: string;
  phoneLabel: string;
  whatsappUrl: string;
  email: string | null;
  notes: string;
  visits: number;
  total: string | null;
  noShows: number;
  returnLabel: string;
  next: { weekday: string; day: number; time: string; text: string; date: string } | null;
  history: Array<{
    key: string;
    date: string;
    service: string;
    pro: string;
    price: string;
    status: ClientProfile["history"][number]["status"];
  }>;
  historyTotal: number;
};

export function toProfileView(profile: ClientProfile, timezone: string): ClientProfileView {
  const since = new Intl.DateTimeFormat("pt-BR", { month: "long", year: "numeric", timeZone: timezone }).format(
    profile.createdAt,
  );
  let next: ClientProfileView["next"] = null;
  if (profile.nextBookingAt) {
    const at = profile.nextBookingAt;
    const date = localDateOf(at, timezone);
    const booking = profile.history.find((h) => h.startsAt.getTime() === at.getTime());
    next = {
      weekday: new Intl.DateTimeFormat("pt-BR", { weekday: "short", timeZone: timezone }).format(at),
      day: Number(date.slice(8, 10)),
      time: formatTime(at, timezone),
      text: booking
        ? `${formatTime(at, timezone)} · ${booking.services.join(", ")} com ${booking.professionalName}`
        : formatTime(at, timezone),
      date,
    };
  }
  return {
    id: profile.id,
    name: profile.name,
    initials: initialsOf(profile.name),
    since: `Cliente desde ${since}`,
    phone: profile.phone,
    phoneLabel: formatBrazilPhone(profile.phone),
    whatsappUrl: buildWhatsAppLink(profile.phone, `Olá, ${firstName(profile.name)}!`),
    email: profile.email,
    notes: profile.notes ?? "",
    visits: profile.visits,
    total: profile.totalCents === null ? null : formatBRL(profile.totalCents),
    noShows: profile.noShows,
    returnLabel: profile.returnEveryDays === null ? "—" : `~ ${profile.returnEveryDays} dias`,
    next,
    history: profile.history.map((h) => ({
      key: h.bookingId,
      date: dmy(localDateOf(h.startsAt, timezone), true),
      service: h.services.join(", "),
      pro: h.professionalName,
      price: formatBRL(h.totalCents),
      status: h.status,
    })),
    historyTotal: profile.historyTotal,
  };
}
