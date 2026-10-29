import { createHmac, timingSafeEqual } from "node:crypto";
import { eq } from "drizzle-orm";
import { whatsappMessages } from "@/db/schema";
import type { Db } from "@/db/types";
import {
  processFreeTextMessage,
  processInteractiveButtonReply,
} from "./interactive-actions";

/**
 * Valida o cabeçalho X-Hub-Signature-256 enviado pela Meta em tempo constante.
 */
export function verifyMetaSignature(
  rawBody: string,
  signatureHeader: string | null,
  secret: string | undefined,
): boolean {
  if (!signatureHeader || !secret) return false;
  const prefix = "sha256=";
  if (!signatureHeader.startsWith(prefix)) return false;

  const signature = signatureHeader.slice(prefix.length);
  const expected = createHmac("sha256", secret).update(rawBody).digest("hex");

  const a = Buffer.from(signature, "hex");
  const b = Buffer.from(expected, "hex");

  if (a.length !== b.length) return false;
  return timingSafeEqual(a, b);
}

type MetaStatusUpdate = {
  id: string;
  status: "sent" | "delivered" | "read" | "failed";
  timestamp: string;
  recipient_id: string;
  errors?: Array<{ code: number; title: string }>;
};

type MetaIncomingMessage = {
  from: string;
  id: string;
  type: string;
  interactive?: {
    type: string;
    button_reply?: {
      id: string;
      title: string;
    };
  };
  text?: {
    body: string;
  };
};

type MetaWebhookPayload = {
  object: string;
  entry?: Array<{
    id?: string;
    changes?: Array<{
      field?: string;
      value?: {
        messaging_product?: string;
        statuses?: MetaStatusUpdate[];
        messages?: MetaIncomingMessage[];
      };
    }>;
  }>;
};

/**
 * Processa a requisição POST do Webhook da Meta, validando a assinatura e
 * executando as atualizações correspondentes no banco.
 */
export async function handleMetaWebhookPost(
  db: Db,
  rawBody: string,
  signatureHeader: string | null,
  secret: string | undefined,
): Promise<{ ok: boolean; error?: string }> {
  if (!verifyMetaSignature(rawBody, signatureHeader, secret)) {
    return { ok: false, error: "Assinatura do webhook inválida" };
  }

  let payload: MetaWebhookPayload;
  try {
    payload = JSON.parse(rawBody) as MetaWebhookPayload;
  } catch {
    return { ok: false, error: "Corpo JSON inválido" };
  }

  const entries = payload.entry ?? [];

  for (const entry of entries) {
    const changes = entry.changes ?? [];
    for (const change of changes) {
      const value = change.value;
      if (!value) continue;

      // 1. Processa status de entrega
      if (value.statuses && Array.isArray(value.statuses)) {
        for (const s of value.statuses) {
          const wamId = s.id;
          const statusDate = new Date(Number(s.timestamp) * 1000);

          if (s.status === "delivered") {
            await db
              .update(whatsappMessages)
              .set({ status: "delivered", deliveredAt: statusDate })
              .where(eq(whatsappMessages.wamId, wamId));
          } else if (s.status === "read") {
            await db
              .update(whatsappMessages)
              .set({ status: "read", readAt: statusDate })
              .where(eq(whatsappMessages.wamId, wamId));
          } else if (s.status === "sent") {
            await db
              .update(whatsappMessages)
              .set({ status: "sent", sentAt: statusDate })
              .where(eq(whatsappMessages.wamId, wamId));
          } else if (s.status === "failed") {
            const err = s.errors?.[0];
            await db
              .update(whatsappMessages)
              .set({
                status: "failed",
                failureCode: err?.code ? String(err.code) : null,
                failureReason: err?.title ?? "Falha de entrega",
              })
              .where(eq(whatsappMessages.wamId, wamId));
          }
        }
      }

      // 2. Processa mensagens recebidas (respostas de botão ou texto livre)
      if (value.messages && Array.isArray(value.messages)) {
        for (const m of value.messages) {
          const fromPhone = m.from;

          // Clique em botão interativo
          if (m.type === "interactive" && m.interactive?.button_reply) {
            await processInteractiveButtonReply(
              db,
              m.interactive.button_reply.id,
              fromPhone,
            );
          } else if (m.type === "text") {
            // Mensagem livre de texto
            await processFreeTextMessage(db, fromPhone);
          }
        }
      }
    }
  }

  return { ok: true };
}
