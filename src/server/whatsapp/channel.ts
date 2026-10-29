import { MetaCloudApiChannel } from "./client";
import { FakeWhatsAppChannel } from "./fake-client";
import type { WhatsAppChannel } from "./types";

let customChannel: WhatsAppChannel | null = null;
const defaultFake = new FakeWhatsAppChannel();

/**
 * Permite injetar um canal customizado nos testes.
 */
export function setWhatsAppChannelForTests(channel: WhatsAppChannel | null) {
  customChannel = channel;
}

/**
 * Retorna o canal ativo de WhatsApp.
 * - Em testes: canal falso (`FakeWhatsAppChannel`).
 * - Em produção com credenciais: `MetaCloudApiChannel`.
 * - Sem credenciais: fallback silencioso para `FakeWhatsAppChannel`.
 */
export function getWhatsAppChannel(): WhatsAppChannel {
  if (customChannel) return customChannel;

  const token = process.env.WHATSAPP_API_TOKEN;
  const phoneNumberId = process.env.WHATSAPP_PHONE_NUMBER_ID;

  if (process.env.NODE_ENV === "test" || !token || !phoneNumberId) {
    return defaultFake;
  }

  return new MetaCloudApiChannel({
    apiToken: token,
    phoneNumberId,
    apiVersion: process.env.WHATSAPP_API_VERSION,
  });
}
