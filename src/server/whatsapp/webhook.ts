import { createHmac, timingSafeEqual } from "node:crypto";
import { and, eq, inArray, lte, or, sql } from "drizzle-orm";
import { auditLog, whatsappInboundEvents, whatsappMessages } from "@/db/schema";
import type { Db } from "@/db/types";
import { withTenant } from "@/server/tenant-db";
import { decryptInboundEvent, encryptInboundEvent } from "./event-crypto";
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
  if (!signatureHeader || !secret || !/^sha256=[0-9a-f]{64}$/i.test(signatureHeader)) return false;
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
  button?: { payload?: string; text?: string };
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

async function executeIncoming(db: Db, m: MetaIncomingMessage): Promise<void> {
  if (m.type === "button" && m.button?.payload) {
    const result = await processInteractiveButtonReply(db, m.button.payload, m.from);
    if (result.uncertain) throw new Error("Envio de resposta com resultado incerto.");
  } else if (m.type === "interactive" && m.interactive?.button_reply) {
    const result = await processInteractiveButtonReply(db, m.interactive.button_reply.id, m.from);
    if (result.uncertain) throw new Error("Envio de resposta com resultado incerto.");
  } else if (m.type === "text") {
    if (!(await processFreeTextMessage(db, m.from)).ok) throw new Error("Envio de resposta com resultado incerto.");
  }
}

async function completeIncoming(db: Db, id: string): Promise<void> {
  await db.update(whatsappInboundEvents).set({ state: "completed", completedAt: new Date(), payloadEncrypted: null }).where(eq(whatsappInboundEvents.id, id));
}

/** Operação de plataforma: chamador deve verificar o superadministrador. */
export async function resolveInboundEvent(db: Db, id: string, actorUserId: string, resolution: "completed" | "retry", now: Date = new Date()): Promise<void> {
  const stale = new Date(now.getTime() - 5 * 60_000);
  const [claimed] = await db.update(whatsappInboundEvents).set({ state: "processing", claimedAt: now, attempts: sql`${whatsappInboundEvents.attempts} + 1` })
    .where(and(eq(whatsappInboundEvents.id, id), or(eq(whatsappInboundEvents.state, "uncertain"), and(eq(whatsappInboundEvents.state, "processing"), lte(whatsappInboundEvents.claimedAt, stale)))))
    .returning({ payloadEncrypted: whatsappInboundEvents.payloadEncrypted });
  if (!claimed) throw new Error("Evento indisponível para revisão.");
  try {
    if (resolution === "retry") {
      if (!claimed.payloadEncrypted) throw new Error("Evento antigo sem conteúdo para reprocessar.");
      const message = decryptInboundEvent<MetaIncomingMessage>(id, claimed.payloadEncrypted);
      if (message.id !== id) throw new Error("Evento inválido.");
      await executeIncoming(db, message);
    }
    await db.transaction(async (tx) => {
      await tx.update(whatsappInboundEvents).set({ state: "completed", completedAt: new Date(), payloadEncrypted: null }).where(eq(whatsappInboundEvents.id, id));
      await tx.insert(auditLog).values({ actorUserId, action: "whatsapp.inbound_resolved", details: { eventId: id, resolution } });
    });
  } catch (error) {
    await db.update(whatsappInboundEvents).set({ state: "uncertain" }).where(eq(whatsappInboundEvents.id, id));
    throw error;
  }
}

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
          const [message] = await db.select({ tenantId: whatsappMessages.tenantId }).from(whatsappMessages).where(eq(whatsappMessages.wamId, wamId)).limit(1);
          if (!message || Number.isNaN(statusDate.getTime())) continue;

          if (s.status === "delivered") {
            await withTenant(db, message.tenantId, (tx) => tx
              .update(whatsappMessages)
              .set({ status: "delivered", deliveredAt: statusDate })
              .where(and(eq(whatsappMessages.wamId, wamId), inArray(whatsappMessages.status, ["queued", "sending", "sent", "delivered"]))));
          } else if (s.status === "read") {
            await withTenant(db, message.tenantId, (tx) => tx
              .update(whatsappMessages)
              .set({ status: "read", readAt: statusDate })
              .where(and(eq(whatsappMessages.wamId, wamId), inArray(whatsappMessages.status, ["queued", "sending", "sent", "delivered", "read"]))));
          } else if (s.status === "sent") {
            await withTenant(db, message.tenantId, (tx) => tx
              .update(whatsappMessages)
              .set({ status: "sent", sentAt: statusDate })
              .where(and(eq(whatsappMessages.wamId, wamId), inArray(whatsappMessages.status, ["queued", "sending", "sent"]))));
          } else if (s.status === "failed") {
            const err = s.errors?.[0];
            await withTenant(db, message.tenantId, (tx) => tx
              .update(whatsappMessages)
              .set({
                status: "failed",
                failureCode: err?.code ? String(err.code) : null,
                failureReason: err?.title ?? "Falha de entrega",
              })
              .where(and(eq(whatsappMessages.wamId, wamId), inArray(whatsappMessages.status, ["queued", "sending", "sent", "failed"]))));
          }
        }
      }

      // 2. Processa mensagens recebidas (respostas de botão ou texto livre)
      if (value.messages && Array.isArray(value.messages)) {
        for (const m of value.messages) {
          if (typeof m.id !== "string" || !m.id || typeof m.from !== "string" || !m.from) continue;
          // Claim persistente impede que entregas concorrentes da Meta repitam efeitos.
          // Se o processo parar durante o envio, permanece processing para revisão;
          // reenvio automático poderia duplicar uma mensagem já aceita pela Meta.
          const claimed = await db.insert(whatsappInboundEvents).values({ id: m.id, payloadEncrypted: encryptInboundEvent(m.id, m) }).onConflictDoNothing().returning({ id: whatsappInboundEvents.id });
          if (!claimed.length) continue;
          try {
          await executeIncoming(db, m);
          await completeIncoming(db, m.id);
          } catch (error) {
            await db.update(whatsappInboundEvents).set({ state: "uncertain" }).where(eq(whatsappInboundEvents.id, m.id));
            throw error;
          }
        }
      }
    }
  }

  return { ok: true };
}
