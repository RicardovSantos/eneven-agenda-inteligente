import { ChevronLeft, ChevronRight, Search } from "lucide-react";
import Link from "next/link";
import { FILTERS, formatLastSeen, situationWhen } from "@/lib/platform-format";
import { cn } from "@/lib/utils";
import { PLATFORM_PAGE_SIZE, type PlatformTenantItem, type PlatformTenantList } from "@/server/platform/tenants";
import type { TenantSituation } from "@/server/tenants/release";
import { SituationBadge } from "./situation-badge";

export type ListState = { situation?: TenantSituation; query: string; page: number };

/** Monta `/admin?situacao=...&q=...&pagina=...` só com o que foi escolhido. */
export function listHref(state: Partial<ListState>): string {
  const params = new URLSearchParams();
  if (state.situation) params.set("situacao", state.situation);
  if (state.query) params.set("q", state.query);
  if (state.page && state.page > 1) params.set("pagina", String(state.page));
  const qs = params.toString();
  return qs ? `/admin?${qs}` : "/admin";
}

/** Pílulas de situação (links: o filtro vive na URL) e a busca. */
export function TenantFilters({
  state,
  counts,
}: {
  state: ListState;
  counts: PlatformTenantList["counts"];
}) {
  // "Teste vencido" só aparece quando há algum (ou já está escolhido): é a lista de quem avisar.
  const filters = [...FILTERS];
  if (counts.trial_expired > 0 || state.situation === "trial_expired") {
    filters.splice(2, 0, { value: "trial_expired", label: "Teste vencido" });
  }

  return (
    <div className="flex flex-wrap items-center gap-3">
      <nav aria-label="Filtrar por situação" className="flex flex-wrap gap-2">
        {filters.map((f) => {
          const on = f.value === state.situation;
          const count = f.value === undefined ? counts.all : counts[f.value];
          return (
            <Link
              key={f.label}
              href={listHref({ situation: f.value, query: state.query })}
              aria-current={on ? "true" : undefined}
              className={cn(
                "inline-flex min-h-10 items-center gap-1.5 rounded-full border px-3.5 text-sm outline-none focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent",
                on
                  ? "border-primary bg-primary-soft font-semibold text-primary"
                  : "border-line bg-surface font-medium text-ink hover:bg-primary-soft/50",
              )}
            >
              {f.label}
              <span className={cn("text-[0.8125rem] tabular-nums", on ? "text-primary" : "text-ink-muted")}>
                {count}
              </span>
            </Link>
          );
        })}
      </nav>

      <form
        action="/admin"
        method="get"
        role="search"
        className="flex min-h-11 w-full items-center gap-2.5 rounded-field border border-line bg-surface px-3.5 text-ink-muted focus-within:border-accent focus-within:outline-2 focus-within:outline-offset-2 focus-within:outline-accent sm:ml-auto sm:w-auto sm:flex-[0_1_300px]"
      >
        <Search className="size-[18px] shrink-0" aria-hidden="true" />
        {state.situation ? <input type="hidden" name="situacao" value={state.situation} /> : null}
        <label htmlFor="busca-estabelecimento" className="sr-only">
          Buscar estabelecimento
        </label>
        <input
          id="busca-estabelecimento"
          type="search"
          name="q"
          defaultValue={state.query}
          maxLength={100}
          placeholder="Nome, link ou e-mail do dono"
          className="min-w-0 flex-1 bg-transparent text-[0.9375rem] text-ink outline-none placeholder:text-ink-muted"
        />
      </form>
    </div>
  );
}

const CELL = "border-b border-line/60 px-3 py-3";

function TenantName({ tenant }: { tenant: PlatformTenantItem }) {
  return (
    <Link
      href={`/admin/estabelecimentos/${tenant.id}`}
      className="flex flex-col gap-0.5 text-ink outline-none before:absolute before:inset-0 before:content-[''] focus-visible:before:outline-2 focus-visible:before:-outline-offset-2 focus-visible:before:outline-accent"
    >
      <span className="font-semibold">{tenant.name}</span>
      <span className="text-[0.8125rem] font-normal text-ink-muted">/{tenant.slug}</span>
    </Link>
  );
}

function OwnerCell({ tenant }: { tenant: PlatformTenantItem }) {
  return (
    <span className="flex flex-col gap-0.5">
      <span>{tenant.ownerName ?? "—"}</span>
      <span className="text-[0.8125rem] text-ink-muted">{tenant.ownerEmail ?? ""}</span>
    </span>
  );
}

/** Tabela (computador) e cartões (celular). */
export function TenantTable({ items, now }: { items: PlatformTenantItem[]; now: Date }) {
  return (
    <>
      <div className="hidden overflow-x-auto rounded-panel border border-line bg-surface lg:block">
        <table className="w-full min-w-[900px] border-collapse text-[0.9375rem]">
          <thead>
            <tr className="text-left text-[0.8125rem] text-ink-muted">
              <th scope="col" className="border-b border-line px-5 py-3.5 font-semibold">Estabelecimento</th>
              <th scope="col" className="border-b border-line px-3 py-3.5 font-semibold">Dono</th>
              <th scope="col" className="border-b border-line px-3 py-3.5 font-semibold">Situação</th>
              <th scope="col" className="border-b border-line px-3 py-3.5 font-semibold">Plano</th>
              <th scope="col" className="border-b border-line px-3 py-3.5 text-right font-semibold">Agend. 30 dias</th>
              <th scope="col" className="border-b border-line px-5 py-3.5 font-semibold">Último acesso</th>
            </tr>
          </thead>
          <tbody>
            {items.map((t) => {
              const when = situationWhen(t, now);
              return (
                <tr key={t.id} className="relative cursor-pointer hover:bg-primary-soft/40">
                  <td className={cn(CELL, "px-5")}>
                    <TenantName tenant={t} />
                  </td>
                  <td className={CELL}>
                    <OwnerCell tenant={t} />
                  </td>
                  <td className={CELL}>
                    <span className="flex flex-col items-start gap-1">
                      <SituationBadge situation={t.situation} />
                      {when ? (
                        <span className="text-[0.8125rem] tabular-nums text-ink-muted">{when}</span>
                      ) : null}
                    </span>
                  </td>
                  <td className={CELL}>{t.planName}</td>
                  <td className={cn(CELL, "text-right tabular-nums")}>{t.bookings30d}</td>
                  <td className={cn(CELL, "px-5 tabular-nums text-ink-muted")}>
                    {formatLastSeen(t.ownerLastLoginAt, now)}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      <ul className="flex flex-col overflow-hidden rounded-panel border border-line bg-surface lg:hidden">
        {items.map((t) => {
          const when = situationWhen(t, now);
          return (
            <li key={t.id} className="border-b border-line/60 last:border-b-0">
              <Link
                href={`/admin/estabelecimentos/${t.id}`}
                className="flex flex-col gap-2 px-4 py-3.5 outline-none hover:bg-primary-soft/40 focus-visible:bg-primary-soft/40"
              >
                <span className="flex items-start justify-between gap-3">
                  <span className="flex min-w-0 flex-col gap-0.5">
                    <span className="truncate font-semibold">{t.name}</span>
                    <span className="truncate text-[0.8125rem] text-ink-muted">/{t.slug}</span>
                  </span>
                  <span className="flex shrink-0 flex-col items-end gap-1">
                    <SituationBadge situation={t.situation} />
                    {when ? <span className="text-[0.8125rem] tabular-nums text-ink-muted">{when}</span> : null}
                  </span>
                </span>
                <span className="flex flex-wrap items-center gap-x-3 gap-y-0.5 text-sm text-ink-muted">
                  <span className="min-w-0 truncate">{t.ownerName ?? "—"}</span>
                  <span>{t.planName}</span>
                  <span className="tabular-nums">{t.bookings30d} agend. em 30 dias</span>
                </span>
              </Link>
            </li>
          );
        })}
      </ul>
    </>
  );
}

export function TenantPager({ state, total }: { state: ListState; total: number }) {
  const pages = Math.max(1, Math.ceil(total / PLATFORM_PAGE_SIZE));
  if (pages <= 1) return null;
  const btn =
    "flex min-h-11 items-center gap-1 rounded-field border border-line bg-surface px-3.5 text-sm font-medium hover:bg-primary-soft";
  return (
    <nav aria-label="Páginas" className="flex items-center justify-between gap-3">
      {state.page > 1 ? (
        <Link href={listHref({ ...state, page: state.page - 1 })} className={btn} rel="prev">
          <ChevronLeft className="size-[18px]" aria-hidden="true" />
          Anterior
        </Link>
      ) : (
        <span />
      )}
      <span className="text-sm tabular-nums text-ink-muted">
        Página {state.page} de {pages}
      </span>
      {state.page < pages ? (
        <Link href={listHref({ ...state, page: state.page + 1 })} className={btn} rel="next">
          Próxima
          <ChevronRight className="size-[18px]" aria-hidden="true" />
        </Link>
      ) : (
        <span />
      )}
    </nav>
  );
}
