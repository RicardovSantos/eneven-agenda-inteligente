import { plural } from "@/lib/dashboard-view";
import { formatBRL } from "@/lib/format";
import type { Dashboard } from "@/server/dashboard";

/** "Serviços mais feitos": os cinco com mais atendimentos concluídos, com barra proporcional. */
export function TopServices({ services }: { services: Dashboard["topServices"] }) {
  const top = Math.max(1, ...services.map((s) => s.count));
  return (
    <section
      aria-labelledby="t-serv"
      className="flex flex-col gap-2.5 rounded-[14px] border border-line bg-surface p-3.5 lg:gap-3.5 lg:rounded-panel lg:px-6 lg:py-5"
    >
      <h2 id="t-serv" className="font-display text-base font-semibold lg:text-xl">
        Serviços mais feitos
      </h2>
      {services.length === 0 ? (
        <p className="text-sm text-ink-muted">Nenhum atendimento concluído neste mês.</p>
      ) : (
        <ol className="flex flex-col gap-2.5 lg:gap-3">
          {services.map((s) => (
            <li key={s.name} className="flex flex-col gap-1.5">
              <div className="flex justify-between gap-3 text-sm lg:text-[0.9375rem]">
                <span className="min-w-0 font-semibold">{s.name}</span>
                <span className="shrink-0 tabular-nums text-ink-muted">
                  {plural(s.count, "vez", "vezes")}
                  <span className="hidden lg:inline"> · {formatBRL(s.cents)}</span>
                </span>
              </div>
              <div aria-hidden="true" className="h-1.5 rounded-full bg-primary-soft lg:h-2">
                <div
                  className="h-full rounded-full bg-primary"
                  style={{ width: `${Math.round((s.count / top) * 100)}%` }}
                />
              </div>
            </li>
          ))}
        </ol>
      )}
    </section>
  );
}
