import { auditText, formatLogTime, type AuditRow } from "@/lib/platform-format";

type Usage = {
  bookings30d: number;
  customers: number;
  activeProfessionals: number;
  maxProfessionals: number | null;
  activeServices: number;
};

const BR = new Intl.NumberFormat("pt-BR");

/** Cartão "Uso": quatro números do estabelecimento (rótulo abaixo do valor, como no mockup). */
export function UsageCard({ usage }: { usage: Usage }) {
  const tiles = [
    { label: "Agendamentos em 30 dias", value: BR.format(usage.bookings30d) },
    { label: "Clientes", value: BR.format(usage.customers) },
    {
      label: "Profissionais",
      value:
        usage.maxProfessionals === null
          ? String(usage.activeProfessionals)
          : `${usage.activeProfessionals} de ${usage.maxProfessionals}`,
    },
    { label: "Serviços ativos", value: BR.format(usage.activeServices) },
  ];
  return (
    <section
      aria-labelledby="t-uso"
      className="flex flex-col gap-3.5 rounded-panel border border-line bg-surface px-5 py-5 sm:px-6"
    >
      <h2 id="t-uso" className="font-display text-xl font-semibold">
        Uso
      </h2>
      <dl className="m-0 grid grid-cols-2 gap-2.5">
        {tiles.map((tile) => (
          <div key={tile.label} className="flex flex-col-reverse gap-0.5 rounded-xl bg-canvas px-3.5 py-3">
            <dt className="text-[0.8125rem] text-ink-muted">{tile.label}</dt>
            <dd className="m-0 font-display text-[1.375rem] font-semibold tabular-nums">{tile.value}</dd>
          </div>
        ))}
      </dl>
    </section>
  );
}

/** Cartão "Histórico": últimas ações da plataforma e do estabelecimento sobre esta conta. */
export function HistoryCard({ rows }: { rows: AuditRow[] }) {
  return (
    <section
      aria-labelledby="t-hist"
      className="flex flex-col gap-1.5 rounded-panel border border-line bg-surface px-5 pb-2 pt-5 sm:px-6"
    >
      <h2 id="t-hist" className="mb-1.5 font-display text-xl font-semibold">
        Histórico
      </h2>
      {rows.length === 0 ? (
        <p className="border-t border-line/70 py-4 text-[0.9375rem] text-ink-muted">Nada registrado ainda.</p>
      ) : (
        <ul className="m-0 list-none p-0">
          {rows.map((row) => (
            <li
              key={row.id}
              className="flex flex-wrap gap-x-4 gap-y-1 border-t border-line/70 py-3 text-[0.9375rem]"
            >
              <span className="w-[130px] flex-none tabular-nums text-ink-muted">{formatLogTime(row.createdAt)}</span>
              <span className="min-w-0 flex-[1_1_18rem]">{auditText(row)}</span>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
