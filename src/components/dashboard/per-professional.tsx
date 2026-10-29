import { formatBRL } from "@/lib/format";
import type { Dashboard } from "@/server/dashboard";

const TH = "border-b border-line py-2.5 font-semibold";

/** "Por profissional": atendidos, faturamento e faltas no mês. */
export function PerProfessional({ professionals }: { professionals: Dashboard["perProfessional"] }) {
  return (
    <section
      aria-labelledby="t-prof"
      className="flex flex-col gap-2 rounded-[14px] border border-line bg-surface pb-2 pt-3.5 lg:rounded-panel lg:pt-5"
    >
      <h2 id="t-prof" className="mx-3.5 font-display text-base font-semibold lg:mx-6 lg:text-xl">
        Por profissional
      </h2>
      {professionals.length === 0 ? (
        <p className="mx-3.5 mb-2 text-sm text-ink-muted lg:mx-6">
          Nenhum atendimento registrado neste mês.
        </p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full min-w-[340px] border-collapse text-sm lg:min-w-[380px] lg:text-[0.9375rem]">
            <thead>
              <tr className="text-left text-[0.8125rem] text-ink-muted">
                <th scope="col" className={`${TH} pl-3.5 pr-2 lg:pl-6`}>Profissional</th>
                <th scope="col" className={`${TH} px-2 text-right lg:px-3`}>Atendidos</th>
                <th scope="col" className={`${TH} px-2 text-right lg:px-3`}>Faturamento</th>
                <th scope="col" className={`${TH} pl-2 pr-3.5 text-right lg:pr-6`}>Faltas</th>
              </tr>
            </thead>
            <tbody className="[&>tr:not(:last-child)>*]:border-b [&>tr:not(:last-child)>*]:border-line">
              {professionals.map((p) => (
                <tr key={p.id}>
                  <th scope="row" className="py-3.5 pl-3.5 pr-2 text-left font-semibold lg:pl-6">
                    <span className="inline-flex items-center gap-2">
                      <span
                        aria-hidden="true"
                        className="size-2 shrink-0 rounded-full bg-ink-muted"
                        style={p.color ? { backgroundColor: p.color } : undefined}
                      />
                      {p.name}
                    </span>
                  </th>
                  <td className="px-2 py-3.5 text-right tabular-nums lg:px-3">{p.completed}</td>
                  <td className="px-2 py-3.5 text-right tabular-nums lg:px-3">{formatBRL(p.cents)}</td>
                  <td className="py-3.5 pl-2 pr-3.5 text-right tabular-nums lg:pr-6">{p.noShows}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}
