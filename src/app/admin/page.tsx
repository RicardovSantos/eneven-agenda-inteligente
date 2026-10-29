import type { Metadata } from "next";
import { Plus } from "lucide-react";
import Link from "next/link";
import { getDb } from "@/db/client";
import { MetricsCards } from "@/components/platform/metrics-cards";
import { TenantFilters, TenantPager, TenantTable } from "@/components/platform/tenant-list";
import { buttonVariants } from "@/components/ui/button";
import { parsePage, parseQuery, parseSituation } from "@/lib/platform-format";
import { cn } from "@/lib/utils";
import { requireSuperAdminSession } from "@/server/auth/guard";
import { getPlatformMetrics } from "@/server/platform/metrics";
import { listPlatformTenants } from "@/server/platform/tenants";
import { getWhatsAppMetrics } from "@/server/platform/whatsapp-metrics";

export const metadata: Metadata = { title: "Estabelecimentos" };

/** Lista da plataforma: números, filtros por situação (na URL), busca e tabela. */
export default async function AdminPage({ searchParams }: PageProps<"/admin">) {
  await requireSuperAdminSession();
  const params = await searchParams;
  const state = {
    situation: parseSituation(params.situacao),
    query: parseQuery(params.q),
    page: parsePage(params.pagina),
  };

  const db = await getDb();
  const now = new Date();
  const [metrics, list, whatsapp] = await Promise.all([
    getPlatformMetrics(db, now),
    listPlatformTenants(db, { ...state, now }),
    getWhatsAppMetrics(db, now),
  ]);
  const filtered = state.situation !== undefined || state.query !== "";

  return (
    <main className="mx-auto flex w-full max-w-[1376px] flex-col gap-5 px-4 pb-10 pt-6 lg:px-8 lg:pt-7">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div className="flex min-w-0 flex-1 basis-64 flex-col gap-1">
          <h1 className="font-display text-[1.75rem] font-semibold">Estabelecimentos</h1>
          <p className="text-sm text-ink-muted">Todos os salões da plataforma, com teste, plano e uso.</p>
        </div>
        <Link
          href="/admin/estabelecimentos/novo"
          className={cn(buttonVariants(), "shrink-0 gap-2 px-[18px] text-[0.9375rem]")}
        >
          <Plus className="size-[18px]" strokeWidth={2.2} aria-hidden="true" />
          Novo estabelecimento
        </Link>
      </div>

      <MetricsCards metrics={metrics} />

      <section className="rounded-panel border border-line bg-surface p-5">
        <h2 className="font-semibold">WhatsApp da plataforma</h2>
        <p>{whatsapp.daily.count} de 250 destinatários nas últimas 24 horas.</p>
        {whatsapp.daily.warnSuperAdmin ? <p>70% do limite diário atingido.</p> : null}
        <p>{whatsapp.monthlySent} mensagens enviadas no mês · custo estimado {new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(whatsapp.estimatedCents / 100)}.</p>
      </section>

      <TenantFilters state={state} counts={list.counts} />

      {list.items.length === 0 ? (
        <div className="flex flex-col items-center gap-2 rounded-panel border border-line bg-surface px-6 py-12 text-center">
          <h2 className="font-display text-xl font-semibold">
            {filtered ? "Nenhum estabelecimento encontrado" : "Nenhum estabelecimento ainda"}
          </h2>
          <p className="max-w-sm text-[0.9375rem] leading-snug text-ink-muted">
            {filtered
              ? "Tente outra busca ou volte para a lista completa."
              : "Quando alguém se cadastrar, ou quando você criar o primeiro, ele aparece aqui."}
          </p>
          {filtered ? (
            <Link href="/admin" className={cn(buttonVariants({ variant: "outline" }), "mt-2")}>
              Limpar filtros
            </Link>
          ) : null}
        </div>
      ) : (
        <TenantTable items={list.items} now={now} />
      )}

      <TenantPager state={state} total={list.total} />
    </main>
  );
}
