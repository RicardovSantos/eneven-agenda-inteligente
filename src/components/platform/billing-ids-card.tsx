import { formatBRL } from "@/lib/format";
import { formatFullDateBR } from "@/lib/platform-format";
import type { TenantBillingIds } from "@/server/platform/billing-ids";

const STATUS: Record<string, string> = {
  pending: "Pendente",
  authorized: "Ativa",
  paused: "Pausada",
  cancelled: "Cancelada",
  canceled: "Cancelada",
  creating: "Criando",
  uncertain: "Incerta",
  abandoned: "Abandonada",
  approved: "Aprovado",
  rejected: "Recusado",
  in_process: "Em análise",
  refunded: "Reembolsado",
  charged_back: "Contestado",
};

function Code({ children }: { children: string }) {
  return <code className="break-all rounded bg-canvas px-1.5 py-0.5 text-[0.8125rem] select-all">{children}</code>;
}

/** Códigos da cobrança do estabelecimento, para conferir um caso com o painel do Mercado Pago. */
export function BillingIdsCard({ tenantId, ids }: { tenantId: string; ids: TenantBillingIds }) {
  return (
    <section aria-labelledby="ids-title" className="flex flex-col gap-4 rounded-panel border border-line bg-surface p-5">
      <header className="flex flex-col gap-1">
        <h2 id="ids-title" className="font-display text-lg font-semibold">Códigos da cobrança</h2>
        <p className="m-0 text-sm text-ink-muted">
          A assinatura e os pagamentos se ligam ao estabelecimento por estes códigos, não pelo e-mail usado para pagar. Dá para buscar por qualquer um na lista.
        </p>
      </header>

      <dl className="m-0 flex flex-col gap-1 text-sm">
        <dt className="text-ink-muted">ID do estabelecimento</dt>
        <dd className="m-0"><Code>{tenantId}</Code></dd>
      </dl>

      <div className="flex flex-col gap-2">
        <h3 className="text-sm font-semibold">Assinaturas</h3>
        {ids.subscriptions.length === 0 ? (
          <p className="m-0 text-sm text-ink-muted">Nenhuma assinatura criada.</p>
        ) : (
          <ul className="m-0 flex list-none flex-col gap-3 p-0">
            {ids.subscriptions.map((s) => (
              <li key={s.reference} className="flex flex-col gap-1.5 rounded-field border border-line p-3 text-sm">
                <span className="font-semibold">
                  {STATUS[s.status] ?? s.status}
                  {s.priceCents ? ` · ${formatBRL(s.priceCents)}/mês` : ""}
                  <span className="font-normal text-ink-muted"> · criada em {formatFullDateBR(s.createdAt)}</span>
                </span>
                <span className="flex flex-col gap-0.5">
                  <span className="text-ink-muted">Referência</span>
                  <Code>{s.reference}</Code>
                </span>
                <span className="flex flex-col gap-0.5">
                  <span className="text-ink-muted">ID da assinatura no Mercado Pago</span>
                  {s.mercadoPagoId ? <Code>{s.mercadoPagoId}</Code> : <span>ainda sem código</span>}
                </span>
              </li>
            ))}
          </ul>
        )}
      </div>

      <div className="flex flex-col gap-2">
        <h3 className="text-sm font-semibold">Pagamentos</h3>
        {ids.payments.length === 0 ? (
          <p className="m-0 text-sm text-ink-muted">Nenhum pagamento recebido.</p>
        ) : (
          <ul className="m-0 flex list-none flex-col gap-2 p-0">
            {ids.payments.map((p) => (
              <li key={p.paymentId} className="flex flex-wrap items-center justify-between gap-2 rounded-field border border-line p-3 text-sm">
                <span className="flex flex-col gap-0.5">
                  <Code>{p.paymentId}</Code>
                  <span className="text-ink-muted">
                    {p.amountCents ? formatBRL(p.amountCents) : ""}
                    {p.dueAt ? ` · vencimento ${formatFullDateBR(p.dueAt)}` : ""}
                  </span>
                </span>
                <span className="font-semibold">{STATUS[p.status] ?? p.status}</span>
              </li>
            ))}
          </ul>
        )}
      </div>
    </section>
  );
}
