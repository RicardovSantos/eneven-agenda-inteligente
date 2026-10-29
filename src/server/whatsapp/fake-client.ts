import { randomUUID } from "node:crypto";
import type {
  SendResult,
  WhatsAppChannel,
  WhatsAppTemplatePayload,
} from "./types";

export type SentMessageRecord = {
  to: string;
  type: "template" | "text";
  payload: WhatsAppTemplatePayload | string;
  wamId: string;
  timestamp: Date;
};

export class FakeWhatsAppChannel implements WhatsAppChannel {
  sentMessages: SentMessageRecord[] = [];
  private nextError: { message: string; code?: string } | null = null;

  setNextError(message: string, code?: string) {
    this.nextError = { message, code };
  }

  async sendTemplate(to: string, template: WhatsAppTemplatePayload): Promise<SendResult> {
    if (this.nextError) {
      const err = this.nextError;
      this.nextError = null;
      return { ok: false, error: err.message, code: err.code };
    }

    const wamId = `fake-wamid-${randomUUID()}`;
    this.sentMessages.push({
      to,
      type: "template",
      payload: template,
      wamId,
      timestamp: new Date(),
    });

    return { ok: true, wamId };
  }

  async sendTextMessage(to: string, text: string): Promise<SendResult> {
    if (this.nextError) {
      const err = this.nextError;
      this.nextError = null;
      return { ok: false, error: err.message, code: err.code };
    }

    const wamId = `fake-wamid-${randomUUID()}`;
    this.sentMessages.push({
      to,
      type: "text",
      payload: text,
      wamId,
      timestamp: new Date(),
    });

    return { ok: true, wamId };
  }

  clear() {
    this.sentMessages = [];
    this.nextError = null;
  }
}
