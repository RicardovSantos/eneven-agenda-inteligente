/**
 * Tipos e interfaces para comunicação via WhatsApp (Cloud API oficial).
 */

export type TemplateType =
  | "booking_created"
  | "reminder_eve"
  | "booking_reminder_eve"
  | "reminder_2h"
  | "booking_reminder_2h"
  | "rescheduled"
  | "booking_rescheduled"
  | "canceled"
  | "booking_canceled";

export type TemplateParameter =
  | { type: "text"; text: string }
  | { type: "payload"; payload: string };

export type TemplateComponent =
  | {
      type: "body";
      parameters: Array<{ type: "text"; text: string }>;
    }
  | {
      type: "button";
      sub_type: "quick_reply";
      index: string;
      parameters: Array<{ type: "payload"; payload: string }>;
    };

export type WhatsAppTemplatePayload = {
  name: string;
  language: { code: string };
  components: TemplateComponent[];
};

export type SendResult =
  | { ok: true; wamId: string }
  | { ok: false; error: string; code?: string; subcode?: number };

export interface WhatsAppChannel {
  sendTemplate(to: string, template: WhatsAppTemplatePayload): Promise<SendResult>;
  sendTextMessage(to: string, text: string): Promise<SendResult>;
}
