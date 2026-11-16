import { cn } from "@/lib/utils";

/**
 * Fio de progresso do sistema visual ("o fio do tempo"): passos ligados por um
 * fio. O trecho percorrido fica no degradê Eneven e o ponto marca o passo
 * atual. Mesmo desenho dos mockups `PublicaServico` e `PublicaHorario`, usado
 * na página pública de agendamento e no primeiro acesso do painel.
 *
 * Componente de servidor (sem estado): `current` é o índice (a partir de 0) do
 * passo atual.
 */

const START = [0x3e, 0x07, 0xd2] as const; // #3E07D2
const MID = [0x94, 0x29, 0xf7] as const; // #9429F7

const lerp = (t: number) =>
  `rgb(${START.map((from, i) => Math.round(from + (MID[i] - from) * t)).join(" ")})`;

/** Trecho já percorrido: o degradê vai de #3E07D2 a #9429F7 ao longo dos passos vencidos. */
function doneLine(index: number, current: number) {
  const span = Math.max(1, current);
  return `linear-gradient(90deg, ${lerp(index / span)}, ${lerp((index + 1) / span)})`;
}

const CURRENT_LINE = "linear-gradient(90deg, #9429F7, #F581FB 40%, var(--line) 40%)";

export function ProgressThread({
  steps,
  current,
  label = "Etapas",
  className,
}: {
  steps: string[];
  current: number;
  /** Nome da lista para leitores de tela. */
  label?: string;
  className?: string;
}) {
  const last = steps.length - 1;
  return (
    <ol
      aria-label={label}
      className={cn("m-0 grid list-none p-0", className)}
      style={{ gridTemplateColumns: `repeat(${steps.length}, minmax(0, 1fr))` }}
    >
      {steps.map((name, index) => {
        const done = index < current;
        const isCurrent = index === current;
        const reached = done || isCurrent;
        return (
          <li
            key={name}
            aria-current={isCurrent ? "step" : undefined}
            className="relative flex flex-col items-center gap-2 text-center"
          >
            {/* O ponto fica no centro da coluna, com o nome centralizado embaixo; o fio vai do centro
                deste ponto ao centro do próximo (por isso começa em 50% e tem a largura da coluna). */}
            <span className="relative flex h-3 w-full items-center justify-center" aria-hidden="true">
              {index < last ? (
                <span
                  className="absolute top-1/2 left-1/2 h-[3px] w-full -translate-y-1/2"
                  style={{
                    background: done
                      ? doneLine(index, current)
                      : isCurrent
                        ? CURRENT_LINE
                        : "var(--line)",
                  }}
                />
              ) : null}
              <span
                className={cn(
                  "relative z-10 size-3 shrink-0 rounded-full",
                  reached
                    ? "bg-[#3E07D2] dark:bg-[#A673FF]"
                    : "bg-surface shadow-[inset_0_0_0_2px_var(--line)]",
                )}
              />
            </span>
            <span
              className={cn(
                "px-0.5 text-xs leading-tight",
                isCurrent ? "font-semibold text-foreground" : "text-ink-muted",
              )}
            >
              {name}
              {done ? <span className="sr-only"> (concluída)</span> : null}
            </span>
          </li>
        );
      })}
    </ol>
  );
}
