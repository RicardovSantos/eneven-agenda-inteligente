import Link from "next/link";
import { getDb } from "@/db/client";
import { requireSuperAdminSession } from "@/server/auth/guard";
import { listRetentionReview } from "@/server/platform/retention-review";

export default async function DataReviewPage() {
  await requireSuperAdminSession();
  const rows = await listRetentionReview(await getDb());
  const date = new Intl.DateTimeFormat("pt-BR", { dateStyle: "short", timeZone: "America/Sao_Paulo" });
  return <main className="mx-auto flex w-full max-w-[900px] flex-col gap-5 p-6">
    <Link href="/admin" className="text-primary">‹ Plataforma</Link>
    <h1 className="text-2xl font-semibold">Revisão de dados inativos</h1>
    <p>Esta lista mostra até 100 estabelecimentos com teste vencido ou cancelamento há pelo menos 90 dias. Ela serve para revisão: nenhum dado é apagado automaticamente.</p>
    <p className="text-sm text-ink-muted">Antes de qualquer exclusão, confirme os avisos, a possibilidade de exportação e as obrigações de preservação aplicáveis. Cancelamentos sem registro de data não aparecem.</p>
    {rows.length === 0 ? <p>Nenhum estabelecimento encontrado.</p> : <ul className="divide-y divide-line rounded-card border border-line bg-surface">{rows.map((row) => <li key={row.id} className="flex flex-wrap items-center justify-between gap-3 p-4"><span><strong>{row.name}</strong><span className="block text-sm text-ink-muted">{row.status === "trial" ? `Teste encerrado em ${date.format(row.trialEndsAt)}` : `Cancelado em ${row.lastCanceled ? date.format(row.lastCanceled) : "data indisponível"}`}</span></span><Link className="text-primary" href={`/admin/estabelecimentos/${row.id}`}>Ver estabelecimento</Link></li>)}</ul>}
  </main>;
}
