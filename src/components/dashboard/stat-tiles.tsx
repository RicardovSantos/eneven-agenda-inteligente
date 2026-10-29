import { ArrowDown, ArrowUp } from "lucide-react";
import type { ReactNode } from "react";
import {
  compareRealized,
  dayAndMonth,
  formatBRLShort,
  formatPercent,
  monthName,
  monthShortName,
  plural,
  shiftMonth,
} from "@/lib/dashboard-view";
import { formatBRL } from "@/lib/format";
import type { Dashboard } from "@/server/dashboard";

function Tile({
  label,
  mobileLabel,
  children,
}: {
  label: string;
  mobileLabel?: string;
  children: ReactNode;
}) {
  return (
    <div className="flex flex-col gap-1 rounded-[14px] border border-line bg-surface p-3.5 lg:gap-1.5 lg:rounded-panel lg:p-5">
      <span className="text-[0.8125rem] font-semibold text-ink-muted lg:text-sm">
        {mobileLabel ? (
          <>
            <span className="lg:hidden">{mobileLabel}</span>
            <span className="hidden lg:inline">{label}</span>
          </>
        ) : (
          label
        )}
      </span>
      {children}
    </div>
  );
}

function Value({ children }: { children: ReactNode }) {
  return (
    <span className="font-display text-[1.375rem] font-semibold tabular-nums leading-tight lg:text-[2.125rem] lg:leading-[1.15]">
      {children}
    </span>
  );
}

/** Valor em reais: sem centavos redondos no celular, completo no computador. */
function Money({ cents }: { cents: number }) {
  const short = formatBRLShort(cents);
  const full = formatBRL(cents);
  if (short === full) return <Value>{full}</Value>;
  return (
    <Value>
      <span className="lg:hidden">{short}</span>
      <span className="hidden lg:inline">{full}</span>
    </Value>
  );
}

const SUB = "text-[0.8125rem] tabular-nums text-ink-muted";
const STRONG = "text-sm font-semibold tabular-nums text-ink";

/** Os quatro números do mês (mockups Main e PainelCelular). */
export function StatTiles({ data }: { data: Dashboard }) {
  const previous = shiftMonth(data.month, -1);
  const comparison = compareRealized(data.realizedCents, data.previousRealizedCents);
  const prevName = monthName(previous);
  const prevCapital = `${prevName[0].toUpperCase()}${prevName.slice(1)}`;

  return (
    <section aria-label="Números do mês" className="grid grid-cols-2 gap-2.5 lg:gap-4 xl:grid-cols-4">
      <Tile label="Faturamento realizado" mobileLabel="Faturamento">
        <Money cents={data.realizedCents} />
        {comparison ? (
          comparison.direction === "same" ? (
            <span className="text-[0.8125rem] font-semibold text-ink-muted lg:text-sm">
              Igual a {prevName}
            </span>
          ) : (
            <span
              className={`flex items-center gap-1.5 text-[0.8125rem] font-semibold lg:text-sm ${
                comparison.direction === "up" ? "text-[#0B7A44] dark:text-success" : "text-ink-muted"
              }`}
            >
              {comparison.direction === "up" ? (
                <ArrowUp className="hidden size-4 lg:block" strokeWidth={2.2} aria-hidden="true" />
              ) : (
                <ArrowDown className="hidden size-4 lg:block" strokeWidth={2.2} aria-hidden="true" />
              )}
              <span>
                {comparison.percent}% {comparison.direction === "up" ? "acima" : "abaixo"} de{" "}
                <span className="lg:hidden">{monthShortName(previous)}</span>
                <span className="hidden lg:inline">{prevName}</span>
              </span>
            </span>
          )
        ) : null}
        <span className={`${SUB} hidden lg:block`}>
          {plural(data.completedCount, "atendimento concluído", "atendimentos concluídos")}
        </span>
      </Tile>

      <Tile label="Previsto nos próximos 30 dias" mobileLabel="Próximos 30 dias">
        <Money cents={data.next30.cents} />
        <span className={`${SUB} lg:hidden`}>{data.next30.count} marcados</span>
        <span className={`${STRONG} hidden lg:block`}>
          {plural(data.next30.count, "agendamento marcado", "agendamentos marcados")}
        </span>
        <span className={`${SUB} hidden lg:block`}>Até {dayAndMonth(data.next30.until)}</span>
      </Tile>

      <Tile label="Agendamentos no mês" mobileLabel="Agendamentos">
        <Value>{data.bookingsCount}</Value>
        <span className={`${SUB} lg:hidden`}>
          {prevCapital}: {data.previousBookingsCount}
        </span>
        <span className={`${STRONG} hidden lg:block`}>
          {prevCapital}: {data.previousBookingsCount}
        </span>
        <span className={`${SUB} hidden lg:block`}>
          Ticket médio {data.averageTicketCents === null ? "—" : formatBRL(data.averageTicketCents)}
        </span>
      </Tile>

      <Tile label="Faltas">
        <Value>{formatPercent(data.noShow.rate)}</Value>
        <span className={`${SUB} lg:hidden`}>
          {data.noShow.count} de {data.noShow.base}
        </span>
        <span className={`${STRONG} hidden lg:block`}>
          {data.noShow.count} de {plural(data.noShow.base, "atendimento", "atendimentos")}
        </span>
        <span className={`${SUB} hidden lg:block`}>
          Cancelamentos: {data.canceled.count}
          {data.canceled.rate === null ? "" : ` (${formatPercent(data.canceled.rate)})`}
        </span>
      </Tile>
    </section>
  );
}
