import { createHmac } from "node:crypto";
import { describe, expect, it, beforeEach } from "vitest";
import { eq } from "drizzle-orm";
import { bookings, whatsappMessages } from "@/db/schema";
import { setWhatsAppChannelForTests } from "@/server/whatsapp/channel";
import { FakeWhatsAppChannel } from "@/server/whatsapp/fake-client";
import { handleMetaWebhookPost } from "@/server/whatsapp/webhook";
import { hashToken } from "@/server/auth/session";
import { withTenant } from "@/server/tenant-db";
import { seedBooking, seedTenant } from "../helpers/agenda-fixtures";
import { createTestDb } from "../helpers/test-db";

describe("Meta WhatsApp Webhook Handling", () => {
  const secret = "test_meta_app_secret";
  let fakeChannel: FakeWhatsAppChannel;

  const sign = (data: string) =>
    `sha256=${createHmac("sha256", secret).update(data).digest("hex")}`;

  beforeEach(() => {
    fakeChannel = new FakeWhatsAppChannel();
    setWhatsAppChannelForTests(fakeChannel);
  });

  describe("Status de entrega (Delivery statuses)", () => {
    it("atualiza mensagem para delivered e read com os timestamps da Meta", async () => {
      const db = await createTestDb();
      const tenant = await seedTenant(db, "webhook-tenant-1");
      const wamId = "wamid.HBgLMTIzNDU2";

      // Cria mensagem com status queued
      await withTenant(db, tenant.id, async (tx) => {
        await tx.insert(whatsappMessages).values({
          tenantId: tenant.id,
          recipientPhone: "5511999998888",
          wamId,
          status: "queued",
        });
      });

      // 1. Recebe status 'delivered'
      const deliveredPayload = JSON.stringify({
        object: "whatsapp_business_account",
        entry: [
          {
            changes: [
              {
                value: {
                  messaging_product: "whatsapp",
                  statuses: [
                    {
                      id: wamId,
                      status: "delivered",
                      timestamp: "1730200000",
                      recipient_id: "5511999998888",
                    },
                  ],
                },
              },
            ],
          },
        ],
      });

      const res1 = await handleMetaWebhookPost(
        db,
        deliveredPayload,
        sign(deliveredPayload),
        secret,
      );
      expect(res1.ok).toBe(true);

      const [msg1] = await withTenant(db, tenant.id, (tx) =>
        tx.select().from(whatsappMessages).where(eq(whatsappMessages.wamId, wamId)),
      );
      expect(msg1.status).toBe("delivered");
      expect(msg1.deliveredAt).toBeDefined();

      // 2. Recebe status 'read'
      const readPayload = JSON.stringify({
        object: "whatsapp_business_account",
        entry: [
          {
            changes: [
              {
                value: {
                  messaging_product: "whatsapp",
                  statuses: [
                    {
                      id: wamId,
                      status: "read",
                      timestamp: "1730200010",
                      recipient_id: "5511999998888",
                    },
                  ],
                },
              },
            ],
          },
        ],
      });

      const res2 = await handleMetaWebhookPost(db, readPayload, sign(readPayload), secret);
      expect(res2.ok).toBe(true);

      const [msg2] = await withTenant(db, tenant.id, (tx) =>
        tx.select().from(whatsappMessages).where(eq(whatsappMessages.wamId, wamId)),
      );
      expect(msg2.status).toBe("read");
      expect(msg2.readAt).toBeDefined();
    });

    it("registra falha com código e motivo retornado pela Meta", async () => {
      const db = await createTestDb();
      const tenant = await seedTenant(db, "webhook-tenant-fail");
      const wamId = "wamid.FAIL123";

      await withTenant(db, tenant.id, async (tx) => {
        await tx.insert(whatsappMessages).values({
          tenantId: tenant.id,
          recipientPhone: "5511999998888",
          wamId,
          status: "queued",
        });
      });

      const failedPayload = JSON.stringify({
        object: "whatsapp_business_account",
        entry: [
          {
            changes: [
              {
                value: {
                  messaging_product: "whatsapp",
                  statuses: [
                    {
                      id: wamId,
                      status: "failed",
                      timestamp: "1730200000",
                      recipient_id: "5511999998888",
                      errors: [
                        {
                          code: 131026,
                          title: "Message undeliverable",
                        },
                      ],
                    },
                  ],
                },
              },
            ],
          },
        ],
      });

      const res = await handleMetaWebhookPost(db, failedPayload, sign(failedPayload), secret);
      expect(res.ok).toBe(true);

      const [msg] = await withTenant(db, tenant.id, (tx) =>
        tx.select().from(whatsappMessages).where(eq(whatsappMessages.wamId, wamId)),
      );
      expect(msg.status).toBe("failed");
      expect(msg.failureCode).toBe("131026");
      expect(msg.failureReason).toContain("Message undeliverable");
    });
  });

  describe("Respostas Interativas de Botão (Quick Replies)", () => {
    it("atualiza agendamento para confirmed ao receber clique em CONFIRM", async () => {
      const db = await createTestDb();
      const tenant = await seedTenant(db, "webhook-btn-confirm");
      const rawToken = "secret-token-abc";
      const booking = await seedBooking(db, tenant.id, {
        status: "scheduled",
        manageTokenHash: hashToken(rawToken),
      });

      const confirmPayload = JSON.stringify({
        object: "whatsapp_business_account",
        entry: [
          {
            changes: [
              {
                value: {
                  messaging_product: "whatsapp",
                  messages: [
                    {
                      from: "5511999998888",
                      id: "wamid.reply1",
                      type: "interactive",
                      interactive: {
                        type: "button_reply",
                        button_reply: {
                          id: `CONFIRM:${booking.id}:${rawToken}`,
                          title: "Confirmar",
                        },
                      },
                    },
                  ],
                },
              },
            ],
          },
        ],
      });

      const res = await handleMetaWebhookPost(db, confirmPayload, sign(confirmPayload), secret);
      expect(res.ok).toBe(true);

      const [updated] = await withTenant(db, tenant.id, (tx) =>
        tx.select().from(bookings).where(eq(bookings.id, booking.id)),
      );
      expect(updated.status).toBe("confirmed");
    });

    it("atualiza agendamento para canceled ao receber clique em CANCEL", async () => {
      const db = await createTestDb();
      const tenant = await seedTenant(db, "webhook-btn-cancel");
      const rawToken = "secret-token-cancel";
      const booking = await seedBooking(db, tenant.id, {
        status: "scheduled",
        manageTokenHash: hashToken(rawToken),
      });

      const cancelPayload = JSON.stringify({
        object: "whatsapp_business_account",
        entry: [
          {
            changes: [
              {
                value: {
                  messaging_product: "whatsapp",
                  messages: [
                    {
                      from: "5511999998888",
                      id: "wamid.reply2",
                      type: "interactive",
                      interactive: {
                        type: "button_reply",
                        button_reply: {
                          id: `CANCEL:${booking.id}:${rawToken}`,
                          title: "Cancelar",
                        },
                      },
                    },
                  ],
                },
              },
            ],
          },
        ],
      });

      const res = await handleMetaWebhookPost(db, cancelPayload, sign(cancelPayload), secret);
      expect(res.ok).toBe(true);

      const [updated] = await withTenant(db, tenant.id, (tx) =>
        tx.select().from(bookings).where(eq(bookings.id, booking.id)),
      );
      expect(updated.status).toBe("canceled");
    });
  });

  describe("Mensagens livres de texto", () => {
    it("responde com link de redirecionamento para o WhatsApp do salão", async () => {
      const db = await createTestDb();
      const tenant = await seedTenant(db, "webhook-free-text");
      // Simula mensagem anterior enviada a este telefone para saber de qual estabelecimento ele é cliente
      await withTenant(db, tenant.id, async (tx) => {
        await tx.insert(whatsappMessages).values({
          tenantId: tenant.id,
          recipientPhone: "5511999997777",
          wamId: "wamid.initial",
          status: "delivered",
        });
      });

      const textPayload = JSON.stringify({
        object: "whatsapp_business_account",
        entry: [
          {
            changes: [
              {
                value: {
                  messaging_product: "whatsapp",
                  messages: [
                    {
                      from: "5511999997777",
                      id: "wamid.incoming.text",
                      type: "text",
                      text: {
                        body: "Boa tarde, gostaria de saber se vocês atendem no sábado",
                      },
                    },
                  ],
                },
              },
            ],
          },
        ],
      });

      const res = await handleMetaWebhookPost(db, textPayload, sign(textPayload), secret);
      expect(res.ok).toBe(true);

      expect(fakeChannel.sentMessages).toHaveLength(1);
      const reply = fakeChannel.sentMessages[0];
      expect(reply.to).toBe("5511999997777");
      expect(reply.type).toBe("text");
      expect(typeof reply.payload === "string" && reply.payload).toContain(tenant.name);
    });
  });
});
