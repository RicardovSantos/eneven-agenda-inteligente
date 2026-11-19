import { formatBRL } from "@/lib/format";
import type { GoogleEvent } from "./google-api";

export type CalendarBooking = {
  id: string;
  status: "scheduled" | "confirmed" | "completed" | "no_show" | "canceled";
  startsAt: Date;
  endsAt: Date;
  totalCents: number;
  customerName: string;
  professionalName: string;
  services: string[];
  timeZone: string;
};

const STATUS_LABEL: Record<CalendarBooking["status"], string> = {
  scheduled: "Agendado",
  confirmed: "Confirmado",
  completed: "Concluído",
  no_show: "Faltou",
  canceled: "Cancelado",
};

/** Cores do Google Agenda (colorId): confirmado verde, concluído cinza, falta vermelho; agendado usa a cor da agenda. */
const STATUS_COLOR: Partial<Record<CalendarBooking["status"], string>> = { confirmed: "10", completed: "8", no_show: "11" };

/**
 * Id do evento no Google: um por agendamento, sempre o mesmo (repetir o envio não duplica). O Google só
 * aceita letras a-v e dígitos (base32hex) em minúsculas, de 5 a 1024 caracteres: "e" + o UUID sem hífens.
 */
export function googleEventId(bookingId: string): string {
  return `e${bookingId.replace(/-/g, "").toLowerCase()}`;
}

/**
 * Evento do Google para um agendamento. Leva só o necessário para a pessoa se organizar: cliente, serviços,
 * profissional, valor e situação. Não leva telefone nem observações, e não convida o cliente (o Google não
 * manda e-mail a ninguém).
 */
export function buildCalendarEvent(booking: CalendarBooking): GoogleEvent {
  const services = booking.services.length > 0 ? booking.services.join(", ") : "Atendimento";
  return {
    id: googleEventId(booking.id),
    summary: `${services} · ${booking.customerName}`.slice(0, 200),
    description: [
      `Cliente: ${booking.customerName}`,
      `Serviços: ${services}`,
      `Profissional: ${booking.professionalName}`,
      `Valor: ${formatBRL(booking.totalCents)}`,
      `Situação: ${STATUS_LABEL[booking.status]}`,
      "",
      "Criado pelo Eneven Agenda. Alterações feitas aqui não voltam para o Eneven Agenda.",
    ].join("\n"),
    start: { dateTime: booking.startsAt.toISOString(), timeZone: booking.timeZone },
    end: { dateTime: booking.endsAt.toISOString(), timeZone: booking.timeZone },
    ...(STATUS_COLOR[booking.status] ? { colorId: STATUS_COLOR[booking.status] } : {}),
    reminders: { useDefault: true },
    status: "confirmed",
    extendedProperties: { private: { enevenBookingId: booking.id } },
  };
}
