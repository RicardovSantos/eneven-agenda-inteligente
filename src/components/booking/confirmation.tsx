import { Bell, CalendarPlus } from "lucide-react";
import Link from "next/link";
import { CompletionCheck } from "@/components/brand/completion-check";
import type { BookingView } from "@/server/public/view";
import { BookingDetails } from "./booking-details";
import {
  brandButton,
  CompactBrand,
  outlineButton,
  textLink,
  whatsappUrl,
  type BookingTenant,
} from "./shell";

/**
 * Liga o aviso do lembrete (mockup `PublicaConfirmado`) quando o Plano 4
 * (lembretes por WhatsApp) entrar. Enquanto não existe lembrete, a tela não
 * promete um.
 */
export const SHOW_REMINDER_NOTICE = false;

/** Confirmação em lugar: o fio se completa em check, resumo e próximas ações. */
export function Confirmation({
  tenant,
  booking,
  token,
  firstName,
}: {
  tenant: BookingTenant;
  booking: BookingView;
  token: string;
  /** Primeiro nome digitado no formulário (nunca o guardado pelo salão). */
  firstName: string;
}) {
  return (
    <div className="flex min-h-dvh flex-col gap-6 px-5 pt-7 pb-5">
      <CompactBrand tenant={tenant} />

      <div className="flex flex-col items-center gap-[18px] pt-3 text-center">
        <CompletionCheck />
        <div className="flex flex-col gap-1.5">
          <h1 className="font-display text-[26px] font-semibold outline-none" tabIndex={-1} id="confirmation-title">
            Agendamento confirmado
          </h1>
          <p className="m-0 text-[15px] text-ink-muted">Te esperamos, {firstName}.</p>
        </div>
      </div>

      <BookingDetails booking={booking} tenant={tenant} />

      {SHOW_REMINDER_NOTICE ? (
        <p className="-mt-2 flex items-start gap-2.5 text-sm text-ink-muted">
          <Bell className="mt-px size-[18px] shrink-0" aria-hidden="true" />
          Você vai receber um lembrete no WhatsApp um dia antes.
        </p>
      ) : null}

      <div className="mt-auto flex flex-col gap-2.5">
        <a href={`/api/agendamento/${token}/ics`} download className={brandButton}>
          <CalendarPlus className="size-[18px]" aria-hidden="true" />
          Adicionar ao calendário
        </a>
        <Link href={`/agendamento/${token}`} className={outlineButton}>
          Remarcar ou cancelar
        </Link>
        {tenant.whatsapp ? (
          <a
            href={whatsappUrl(tenant.whatsapp)}
            target="_blank"
            rel="noopener noreferrer"
            className={textLink}
          >
            Falar com {tenant.name} no WhatsApp
          </a>
        ) : null}
      </div>
    </div>
  );
}
