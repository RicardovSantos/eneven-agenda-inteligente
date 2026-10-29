import type { Db } from "@/db/types";
import { clientsHref, toClientRow, type ClientFilterParam } from "@/components/clients/view";
import type { ClientListProps } from "@/components/clients/client-list";
import type { PanelActor } from "@/server/agenda/panel-ops";
import { LAPSED_DAYS, listClients } from "@/server/clients";

/** Páginas que a URL pode pedir de uma vez ("Carregar mais" soma páginas). */
const MAX_PAGES = 40;

type Params = Record<string, string | string[] | undefined>;

function first(value: string | string[] | undefined): string | undefined {
  return Array.isArray(value) ? value[0] : value;
}

export type ClientsQuery = {
  q: string;
  filtro: ClientFilterParam | undefined;
  pagina: number;
};

/** `?q=`, `?filtro=com-horario|sem-voltar` e `?pagina=`, com valores inválidos ignorados. */
export function parseClientsQuery(params: Params): ClientsQuery {
  const q = (first(params.q) ?? "").trim().slice(0, 80);
  const f = first(params.filtro);
  const filtro = f === "com-horario" || f === "sem-voltar" ? f : undefined;
  const n = Number(first(params.pagina));
  const pagina = Number.isInteger(n) && n >= 1 ? Math.min(n, MAX_PAGES) : 1;
  return { q, filtro, pagina };
}

const plural = (n: number) => `${n} ${n === 1 ? "cliente" : "clientes"}`;

/** Lista das páginas 1..N (renderizada no servidor) no formato do componente. */
export async function loadClientListProps(
  db: Db,
  actor: PanelActor,
  query: ClientsQuery,
  ctx: { timezone: string; publicUrl: string | null; selectedId?: string },
): Promise<ClientListProps> {
  const now = new Date();
  const filter = query.filtro === "com-horario" ? "upcoming" : query.filtro === "sem-voltar" ? "lapsed" : "all";
  const last = await listClients(db, actor, { query: query.q, filter, page: 1, pages: query.pagina, now });
  const staff = actor.role === "staff";
  const hint = staff
    ? `${plural(last.total)}. Aqui ficam só os clientes que você atendeu.`
    : `${plural(last.total)}. Quem agenda pelo link entra aqui sozinho.`;

  return {
    rows: last.items.map((item) => toClientRow(item, now, ctx.timezone, LAPSED_DAYS)),
    total: last.total,
    query: query.q,
    filter: query.filtro,
    selectedId: ctx.selectedId,
    showTotal: !staff,
    canCreate: !staff,
    moreHref: last.hasMore
      ? clientsHref({ id: ctx.selectedId, q: query.q || undefined, filtro: query.filtro, pagina: query.pagina + 1 })
      : null,
    publicUrl: ctx.publicUrl,
    hint,
  };
}
