import { TZDate } from "@date-fns/tz";
import type {
  TemplateComponent,
  TemplateType,
  WhatsAppTemplatePayload,
} from "./types";

export type TemplateData = {
  customerName: string;
  tenantName: string;
  serviceName: string;
  professionalName: string;
  startsAt: Date;
  timezone: string;
  manageUrl: string;
  bookingId: string;
  manageToken: string;
};

const WEEKDAYS = [
  "domingo",
  "segunda-feira",
  "terça-feira",
  "quarta-feira",
  "quinta-feira",
  "sexta-feira",
  "sábado",
];

export function formatBookingDate(startsAt: Date, timezone: string): string {
  const z = new TZDate(startsAt.getTime(), timezone);
  const dd = String(z.getDate()).padStart(2, "0");
  const mm = String(z.getMonth() + 1).padStart(2, "0");
  const dayName = WEEKDAYS[z.getDay()];
  return `${dayName}, ${dd}/${mm}`;
}

export function formatBookingTime(startsAt: Date, timezone: string): string {
  const z = new TZDate(startsAt.getTime(), timezone);
  const hh = String(z.getHours()).padStart(2, "0");
  const min = String(z.getMinutes()).padStart(2, "0");
  return `${hh}:${min}`;
}

/**
 * Constrói o payload oficial da Meta Cloud API para cada tipo de template.
 */
export function buildTemplatePayload(
  type: TemplateType,
  data: TemplateData,
): WhatsAppTemplatePayload {
  const dateStr = formatBookingDate(data.startsAt, data.timezone);
  const timeStr = formatBookingTime(data.startsAt, data.timezone);

  const baseParameters = [
    { type: "text" as const, text: data.customerName },
    { type: "text" as const, text: data.tenantName },
    { type: "text" as const, text: data.serviceName },
    { type: "text" as const, text: data.professionalName },
    { type: "text" as const, text: dateStr },
    { type: "text" as const, text: timeStr },
    { type: "text" as const, text: data.manageUrl },
  ];

  const bodyComponent: TemplateComponent = {
    type: "body",
    parameters: baseParameters,
  };

  const components: TemplateComponent[] = [bodyComponent];

  let templateName: string;

  switch (type) {
    case "booking_created":
      templateName = "booking_created";
      break;

    case "reminder_eve":
    case "booking_reminder_eve":
      templateName = "booking_reminder_eve";
      // 3 botões interativos quick_reply: Confirmar, Remarcar, Cancelar
      components.push(
        {
          type: "button",
          sub_type: "quick_reply",
          index: "0",
          parameters: [
            {
              type: "payload",
              payload: `CONFIRM:${data.bookingId}:${data.manageToken}`,
            },
          ],
        },
        {
          type: "button",
          sub_type: "quick_reply",
          index: "1",
          parameters: [
            {
              type: "payload",
              payload: `RESCHEDULE:${data.bookingId}:${data.manageToken}`,
            },
          ],
        },
        {
          type: "button",
          sub_type: "quick_reply",
          index: "2",
          parameters: [
            {
              type: "payload",
              payload: `CANCEL:${data.bookingId}:${data.manageToken}`,
            },
          ],
        },
      );
      break;

    case "reminder_2h":
    case "booking_reminder_2h":
      templateName = "booking_reminder_2h";
      // 2 botões rápidos: Confirmar, Cancelar
      components.push(
        {
          type: "button",
          sub_type: "quick_reply",
          index: "0",
          parameters: [
            {
              type: "payload",
              payload: `CONFIRM:${data.bookingId}:${data.manageToken}`,
            },
          ],
        },
        {
          type: "button",
          sub_type: "quick_reply",
          index: "1",
          parameters: [
            {
              type: "payload",
              payload: `CANCEL:${data.bookingId}:${data.manageToken}`,
            },
          ],
        },
      );
      break;

    case "rescheduled":
    case "booking_rescheduled":
      templateName = "booking_rescheduled";
      break;

    case "canceled":
    case "booking_canceled":
      templateName = "booking_canceled";
      break;

  }

  return {
    name: templateName,
    language: { code: "pt_BR" },
    components,
  };
}
