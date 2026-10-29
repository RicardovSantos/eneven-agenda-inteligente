import { ChevronLeft, ChevronRight } from "lucide-react";
import Link from "next/link";
import { monthLabel, shiftMonth } from "@/lib/dashboard-view";

const ARROW =
  "flex size-11 items-center justify-center rounded-full text-ink transition-colors hover:bg-primary-soft focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent lg:size-10";

/** Seletor de mês: setas para o anterior e o próximo (`?mes=yyyy-MM`), sem limite. */
export function MonthSwitcher({ month }: { month: string }) {
  return (
    <div className="flex items-center justify-between lg:justify-start lg:gap-1 lg:rounded-full lg:border lg:border-line lg:bg-surface lg:p-1">
      <Link href={`?mes=${shiftMonth(month, -1)}`} aria-label="Mês anterior" className={ARROW}>
        <ChevronLeft className="size-5 lg:size-[18px]" aria-hidden="true" />
      </Link>
      <span
        aria-live="polite"
        className="text-center font-display text-base font-semibold lg:min-w-[150px]"
      >
        {monthLabel(month)}
      </span>
      <Link href={`?mes=${shiftMonth(month, 1)}`} aria-label="Próximo mês" className={ARROW}>
        <ChevronRight className="size-5 lg:size-[18px]" aria-hidden="true" />
      </Link>
    </div>
  );
}
