import Link from "next/link";
import { getDb } from "@/db/client";
import { formatBRL } from "@/lib/format";
import { getBillingOverview } from "@/server/billing/queries";
import { requirePanelRole } from "@/server/panel/roles";

const statusLabel: Record<string, string> = { pending: "Pendente", approved: "Paga", paid: "Paga", rejected: "Não aprovada", cancelled: "Cancelada", canceled: "Cancelada", refunded: "Reembolsada" };

export default async function AssinaturaPage() {
  const { session, timezone } = await requirePanelRole(["owner"]);
  const { current, available, invoices, pendingCheckoutUrl } = await getBillingOverview(await getDb(), session.tenantId);
  const date = new Intl.DateTimeFormat("pt-BR", { dateStyle: "short", timeZone: timezone });
  return <div className="mx-auto flex w-full max-w-[720px] flex-col gap-6">
    <Link href="/painel/configuracoes" className="text-sm text-primary">‹ Configurações</Link>
    <h1 className="text-[1.75rem] font-semibold">Plano e faturas</h1>
    <section className="rounded-card border border-line bg-surface p-5">
      <h2 className="font-semibold">Plano atual: {current.name}</h2>
      {current.status === "trial" ? <p>Você está no período de teste.</p> : null}
    </section>
    <section className="rounded-card border border-line bg-surface p-5">
      <h2 className="font-semibold">Planos disponíveis</h2>
      <ul className="mt-3 space-y-3">{available.map((plan) => <li key={plan.id} className="border-t border-line pt-3">
        <p className="font-semibold">{plan.name} · {formatBRL(plan.priceCents)}/mês {current.id === plan.id ? "· Atual" : ""}</p>
        <p className="text-sm text-ink-muted">{plan.maxProfessionals === null ? "Profissionais ilimitados" : `Até ${plan.maxProfessionals} profissionais`} · {plan.monthlyMessages} mensagens por mês</p>
      </li>)}</ul>
      <p className="mt-3 text-sm text-ink-muted">A contratação e a troca de plano estarão disponíveis em breve.</p>
      {process.env.NODE_ENV !== "production" && pendingCheckoutUrl ? <a className="mt-3 inline-block text-primary" href={pendingCheckoutUrl} target="_blank" rel="noopener noreferrer">Continuar assinatura de teste →</a> : null}
    </section>
    <section className="rounded-card border border-line bg-surface p-5">
      <h2 className="font-semibold">Faturas</h2>
      {invoices.length === 0 ? <p className="mt-2 text-sm text-ink-muted">Nenhuma fatura registrada.</p> : <ul className="mt-3 space-y-2">{invoices.map((invoice) => <li key={invoice.id} className="border-t border-line pt-2">
        {formatBRL(invoice.amountCents)} · {statusLabel[invoice.status] ?? "Em processamento"}{invoice.dueAt ? ` · Vencimento: ${date.format(invoice.dueAt)}` : ""}{invoice.paidAt ? ` · Pago: ${date.format(invoice.paidAt)}` : ""}
      </li>)}</ul>}
    </section>
  </div>;
}
