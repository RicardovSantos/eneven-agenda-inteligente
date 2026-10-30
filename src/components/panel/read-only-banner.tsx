import { MessageCircle } from "lucide-react";
import Link from "next/link";

export const READ_ONLY_TEXT =
  "Sua agenda está em modo somente leitura: a página de agendamento está fora do ar e não dá para marcar novos horários.";

/**
 * Faixa de somente leitura (estabelecimento sem plano ativo). `whatsappUrl` só
 * vem quando a variável `SUPPORT_WHATSAPP` está configurada.
 */
export function ReadOnlyBanner({ whatsappUrl, billingUrl }: { whatsappUrl: string | null; billingUrl?: string }) {
  return (
    <div
      role="region"
      aria-label="Somente leitura"
      data-testid="read-only-banner"
      className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2.5 bg-[#FFF1E8] px-4 py-3 text-[0.9375rem] leading-snug text-[#9A3412] dark:bg-[#3a2418] dark:text-[#fdba74] lg:px-8"
    >
      <p className="min-w-0 flex-[1_1_20rem]">{READ_ONLY_TEXT}</p>
      {billingUrl ? <Link href={billingUrl} className="min-h-11 content-center rounded-field border border-[#9A3412]/50 px-4 text-sm font-semibold">Ver plano e faturas</Link> : null}
      {whatsappUrl ? (
        <a
          href={whatsappUrl}
          target="_blank"
          rel="noopener noreferrer"
          className="flex min-h-11 shrink-0 items-center gap-2 rounded-field border border-[#9A3412]/50 px-4 text-sm font-semibold text-[#9A3412] outline-none hover:bg-[#9A3412]/10 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#9A3412] dark:border-[#fdba74]/60 dark:text-[#fdba74] dark:hover:bg-[#fdba74]/10 dark:focus-visible:outline-[#fdba74]"
        >
          <MessageCircle className="size-[18px]" aria-hidden="true" />
          Falar com a Eneven
        </a>
      ) : null}
    </div>
  );
}
