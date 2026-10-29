import { situationLabel } from "@/lib/platform-format";
import { cn } from "@/lib/utils";
import type { TenantSituation } from "@/server/tenants/release";

/** Cores do mockup (`Admin.dc.html`), com equivalente no tema escuro. Sempre cor + texto. */
const TONE: Record<TenantSituation, string> = {
  trial: "bg-primary-soft text-primary",
  active: "bg-[#E8F7EF] text-[#0B7A44] dark:bg-[#12301f] dark:text-[#3dd68c]",
  past_due: "bg-[#FFF1E8] text-[#B23A0A] dark:bg-[#3a2418] dark:text-[#fb923c]",
  trial_expired: "bg-[#FFF1E8] text-[#B23A0A] dark:bg-[#3a2418] dark:text-[#fb923c]",
  read_only: "bg-[#EEEBF6] text-ink-muted dark:bg-line",
  canceled: "bg-[#EEEBF6] text-ink-muted dark:bg-line",
};

export function SituationBadge({
  situation,
  className,
}: {
  situation: TenantSituation;
  className?: string;
}) {
  return (
    <span
      className={cn(
        "inline-flex w-fit items-center whitespace-nowrap rounded-full px-2.5 py-[3px] text-xs font-semibold",
        TONE[situation],
        className,
      )}
    >
      {situationLabel(situation)}
    </span>
  );
}
