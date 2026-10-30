import { normalizeBrazilPhone } from "@/lib/phone";
import type {
  SendResult,
  WhatsAppChannel,
  WhatsAppTemplatePayload,
} from "./types";

export type MetaClientConfig = {
  phoneNumberId: string;
  apiToken: string;
  apiVersion?: string;
};

export class MetaCloudApiChannel implements WhatsAppChannel {
  private phoneNumberId: string;
  private apiToken: string;
  private apiVersion: string;
  private fetchImpl: typeof fetch;

  constructor(config: MetaClientConfig, fetchImpl: typeof fetch = fetch) {
    this.phoneNumberId = config.phoneNumberId;
    this.apiToken = config.apiToken;
    this.apiVersion = config.apiVersion ?? "v21.0";
    this.fetchImpl = fetchImpl;
  }

  private get endpoint(): string {
    return `https://graph.facebook.com/${this.apiVersion}/${this.phoneNumberId}/messages`;
  }

  private cleanPhone(phone: string): string | null {
    return normalizeBrazilPhone(phone);
  }

  async sendTemplate(to: string, template: WhatsAppTemplatePayload): Promise<SendResult> {
    const recipient = this.cleanPhone(to);
    if (!recipient) return { ok: false, error: "Telefone inválido." };
    const body = {
      messaging_product: "whatsapp",
      recipient_type: "individual",
      to: recipient,
      type: "template",
      template,
    };

    return this.post(body);
  }

  async sendTextMessage(to: string, text: string): Promise<SendResult> {
    const recipient = this.cleanPhone(to);
    if (!recipient) return { ok: false, error: "Telefone inválido." };
    const body = {
      messaging_product: "whatsapp",
      recipient_type: "individual",
      to: recipient,
      type: "text",
      text: {
        preview_url: false,
        body: text,
      },
    };

    return this.post(body);
  }

  private async post(body: unknown): Promise<SendResult> {
    try {
      const response = await this.fetchImpl(this.endpoint, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${this.apiToken}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify(body),
        signal: AbortSignal.timeout(10_000),
      });

      const json = (await response.json()) as {
        messages?: Array<{ id: string }>;
        error?: {
          message: string;
          type: string;
          code: number;
          error_subcode?: number;
        };
      };

      if (!response.ok || !json.messages?.[0]?.id) {
        const errorMsg = json.error?.message ?? `Falha na requisição Meta: HTTP ${response.status}`;
        const code = json.error?.code ? String(json.error.code) : undefined;
        const subcode = json.error?.error_subcode;
        return {
          ok: false,
          error: errorMsg,
          code,
          subcode,
        };
      }

      return {
        ok: true,
        wamId: json.messages[0].id,
      };
    } catch (err) {
      const message = err instanceof Error ? err.message : "Erro de conexão com o WhatsApp";
      return {
        ok: false,
        error: message,
      };
    }
  }
}
