"use client";

import { Copy, Plus } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { EmptyState } from "@/components/catalog/parts";
import { Button } from "@/components/ui/button";
import { useToast } from "@/components/ui/toast";
import { cn } from "@/lib/utils";
import { ClientFilters } from "./client-filters";
import { ClientFormDialog } from "./client-form-dialog";
import { clientsHref, type ClientFilterParam, type ClientRow } from "./view";

export type ClientListProps = {
  rows: ClientRow[];
  total: number;
  query: string;
  filter: ClientFilterParam | undefined;
  /** Ficha aberta (no computador ela aparece ao lado da lista). */
  selectedId?: string;
  /** Mostra a coluna "Total gasto" (some para o profissional). */
  showTotal: boolean;
  /** Pode cadastrar clientes (proprietário e recepção). */
  canCreate: boolean;
  /** "Carregar mais" quando há mais páginas. */
  moreHref: string | null;
  /** Link público do salão, para o estado vazio. */
  publicUrl: string | null;
  /** Texto de apoio abaixo do título. */
  hint: string;
};

/** Lista de clientes: tabela no computador, lista de linhas no celular. */
export function ClientList({
  rows,
  total,
  query,
  filter,
  selectedId,
  showTotal,
  canCreate,
  moreHref,
  publicUrl,
  hint,
}: ClientListProps) {
  const router = useRouter();
  const toast = useToast();
  const [creating, setCreating] = useState(false);
  const href = (id: string) => clientsHref({ id, q: query || undefined, filtro: filter });
  const filtered = query !== "" || filter !== undefined;

  async function copyLink() {
    if (!publicUrl) return;
    try {
      await navigator.clipboard.writeText(publicUrl);
      toast.show("Link copiado");
    } catch {
      toast.show("Não foi possível copiar. Selecione e copie o link.", "error");
    }
  }

  return (
    <>
      {/* Cabeçalho: faixa branca no celular, solto no computador */}
      <div className="-mx-4 -mt-6 flex flex-col gap-3 border-b border-line bg-surface px-4 pb-3 pt-4 lg:m-0 lg:gap-[18px] lg:border-0 lg:bg-transparent lg:p-0">
        <div className="flex items-center justify-between gap-4">
          <div className="flex min-w-0 flex-1 items-baseline justify-between gap-3 lg:flex-col lg:items-start lg:justify-start lg:gap-1">
            <h1 className="font-display text-[1.375rem] font-semibold lg:text-[1.75rem]">Clientes</h1>
            <p className="hidden text-sm tabular-nums text-ink-muted lg:block">{hint}</p>
            <span className="text-sm tabular-nums text-ink-muted lg:hidden">{total}</span>
          </div>
          {canCreate ? (
            <Button onClick={() => setCreating(true)} className="shrink-0 px-[18px] max-lg:hidden">
              <Plus className="size-[18px]" aria-hidden="true" />
              Novo cliente
            </Button>
          ) : null}
        </div>
        <ClientFilters query={query} filter={filter} selectedId={selectedId} />
      </div>

      {rows.length === 0 ? (
        filtered ? (
          <EmptyState
            title={query ? `Nenhum cliente encontrado para “${query}”.` : "Nenhum cliente neste filtro."}
            text={
              query
                ? "Confira o nome ou o número e tente de novo."
                : "Quando alguém se encaixar aqui, aparece nesta lista."
            }
          />
        ) : (
          <EmptyState
            title="Seus clientes aparecem aqui assim que agendarem pelo link."
            text="Quem agenda pela sua página entra na lista sozinho. Você também pode cadastrar um cliente à mão."
            action={
              publicUrl ? (
                <Button variant="outline" onClick={copyLink}>
                  <Copy aria-hidden="true" />
                  Copiar link
                </Button>
              ) : null
            }
          />
        )
      ) : (
        <>
          {/* Tabela (computador) */}
          <div className="hidden overflow-x-auto rounded-panel border border-line bg-surface lg:block">
            <table className="w-full min-w-[640px] border-collapse text-[0.9375rem]">
              <thead>
                <tr className="text-left text-[0.8125rem] text-ink-muted">
                  <th scope="col" className="border-b border-line px-5 py-3.5 font-semibold">Cliente</th>
                  <th scope="col" className="border-b border-line px-3 py-3.5 font-semibold">Última visita</th>
                  <th scope="col" className="border-b border-line px-3 py-3.5 text-right font-semibold">Visitas</th>
                  {showTotal ? (
                    <th scope="col" className="border-b border-line px-3 py-3.5 text-right font-semibold">Total gasto</th>
                  ) : null}
                  <th scope="col" className="border-b border-line px-5 py-3.5 text-right font-semibold">Faltas</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => (
                  <tr
                    key={r.id}
                    onClick={() => router.push(href(r.id))}
                    className={cn(
                      "cursor-pointer hover:bg-primary-soft/40",
                      selectedId === r.id && "bg-primary-soft/60 shadow-[inset_3px_0_0_var(--primary)]",
                    )}
                  >
                    <td className="border-b border-line/60 px-5 py-3">
                      <Link
                        href={href(r.id)}
                        aria-current={selectedId === r.id ? "page" : undefined}
                        className="flex flex-col gap-0.5 outline-none focus-visible:underline"
                      >
                        <span className="font-semibold text-foreground">{r.name}</span>
                        <span className="text-[0.8125rem] tabular-nums text-ink-muted">{r.phone}</span>
                      </Link>
                    </td>
                    <td className="border-b border-line/60 px-3 py-3">
                      <span className="flex flex-col gap-0.5">
                        <span className="tabular-nums">{r.last}</span>
                        {r.next ? (
                          <span className="text-[0.8125rem] font-semibold tabular-nums text-primary">{r.next}</span>
                        ) : null}
                      </span>
                    </td>
                    <td className="border-b border-line/60 px-3 py-3 text-right tabular-nums">{r.visits}</td>
                    {showTotal ? (
                      <td className="border-b border-line/60 px-3 py-3 text-right tabular-nums">{r.total}</td>
                    ) : null}
                    <td className="border-b border-line/60 px-5 py-3 text-right tabular-nums">{r.noShows}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* Lista (celular) */}
          <ul className="-mx-4 flex flex-col bg-surface lg:hidden">
            {rows.map((r) => (
              <li key={r.id} className="border-b border-line/60">
                <Link href={href(r.id)} className="flex min-h-16 items-center gap-3 px-4 py-2 text-foreground">
                  <span
                    aria-hidden="true"
                    className="grid size-10 shrink-0 place-items-center rounded-full bg-primary-soft font-display text-sm font-semibold text-primary"
                  >
                    {r.initials}
                  </span>
                  <span className="flex min-w-0 flex-1 flex-col gap-0.5">
                    <span className="truncate text-base font-semibold">{r.name}</span>
                    <span
                      className={cn(
                        "truncate text-[0.8125rem] tabular-nums",
                        r.next ? "font-semibold text-primary" : "text-ink-muted",
                      )}
                    >
                      {r.sub}
                    </span>
                  </span>
                  <span className="shrink-0 text-sm tabular-nums text-ink-muted">{r.visitsLabel}</span>
                </Link>
              </li>
            ))}
          </ul>

          {moreHref ? (
            <Link
              href={moreHref}
              scroll={false}
              className="flex h-11 items-center justify-center self-center rounded-field border border-line bg-surface px-6 text-base font-semibold text-foreground hover:bg-primary-soft"
            >
              Carregar mais
            </Link>
          ) : null}
        </>
      )}

      {canCreate ? (
        <>
          <button
            type="button"
            onClick={() => setCreating(true)}
            aria-label="Novo cliente"
            className="fixed bottom-[calc(5rem+env(safe-area-inset-bottom))] right-[18px] z-10 grid size-14 cursor-pointer place-items-center rounded-[18px] bg-primary text-primary-foreground shadow-[0_12px_32px_-12px_rgb(62_7_210_/_0.6)] lg:hidden"
          >
            <Plus className="size-6" aria-hidden="true" />
          </button>
          <ClientFormDialog open={creating} onClose={() => setCreating(false)} />
        </>
      ) : null}
    </>
  );
}
