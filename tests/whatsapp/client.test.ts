import { describe, expect, it, vi, beforeEach } from "vitest";
import { MetaCloudApiChannel } from "@/server/whatsapp/client";
import { FakeWhatsAppChannel } from "@/server/whatsapp/fake-client";
import type { WhatsAppTemplatePayload } from "@/server/whatsapp/types";

describe("WhatsApp Channels", () => {
  const sampleTemplate: WhatsAppTemplatePayload = {
    name: "booking_created",
    language: { code: "pt_BR" },
    components: [
      {
        type: "body",
        parameters: [{ type: "text", text: "Maria" }],
      },
    ],
  };

  describe("FakeWhatsAppChannel", () => {
    it("registra envios em memória com wamId determinístico", async () => {
      const fake = new FakeWhatsAppChannel();
      const res = await fake.sendTemplate("5511999998888", sampleTemplate);

      expect(res.ok).toBe(true);
      if (res.ok) {
        expect(res.wamId).toMatch(/^fake-wamid-/);
      }

      expect(fake.sentMessages).toHaveLength(1);
      expect(fake.sentMessages[0].to).toBe("5511999998888");
      expect(fake.sentMessages[0].type).toBe("template");
    });

    it("simula erro configurado previamente", async () => {
      const fake = new FakeWhatsAppChannel();
      fake.setNextError("Falha de rede simulada", "100");

      const res = await fake.sendTemplate("5511999998888", sampleTemplate);
      expect(res.ok).toBe(false);
      if (!res.ok) {
        expect(res.error).toBe("Falha de rede simulada");
        expect(res.code).toBe("100");
      }

      // Próxima chamada deve voltar ao normal
      const nextRes = await fake.sendTemplate("5511999998888", sampleTemplate);
      expect(nextRes.ok).toBe(true);
    });
  });

  describe("MetaCloudApiChannel (HTTP)", () => {
    const config = {
      phoneNumberId: "1234567890",
      apiToken: "EAAB_TEST_TOKEN",
      apiVersion: "v21.0",
    };

    beforeEach(() => {
      vi.restoreAllMocks();
    });

    it("envia template com sucesso (200 OK)", async () => {
      const mockFetch = vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        json: async () => ({
          messaging_product: "whatsapp",
          contacts: [{ input: "5511999998888", wa_id: "5511999998888" }],
          messages: [{ id: "wamid.HBgLMTIzNDU2" }],
        }),
      });

      const client = new MetaCloudApiChannel(config, mockFetch as unknown as typeof fetch);
      const res = await client.sendTemplate("5511999998888", sampleTemplate);

      expect(res.ok).toBe(true);
      if (res.ok) {
        expect(res.wamId).toBe("wamid.HBgLMTIzNDU2");
      }

      expect(mockFetch).toHaveBeenCalledWith(
        "https://graph.facebook.com/v21.0/1234567890/messages",
        expect.objectContaining({
          method: "POST",
          headers: expect.objectContaining({
            Authorization: "Bearer EAAB_TEST_TOKEN",
            "Content-Type": "application/json",
          }),
        }),
      );
    });

    it("trata erro retornado pela Meta (ex: 400 OAuthException)", async () => {
      const mockFetch = vi.fn().mockResolvedValue({
        ok: false,
        status: 400,
        json: async () => ({
          error: {
            message: "Template does not exist",
            type: "OAuthException",
            code: 100,
            error_subcode: 2388001,
          },
        }),
      });

      const client = new MetaCloudApiChannel(config, mockFetch as unknown as typeof fetch);
      const res = await client.sendTemplate("5511999998888", sampleTemplate);

      expect(res.ok).toBe(false);
      if (!res.ok) {
        expect(res.error).toContain("Template does not exist");
        expect(res.code).toBe("100");
        expect(res.subcode).toBe(2388001);
      }
    });

    it("normaliza telefone para envio removendo caracteres extras", async () => {
      const mockFetch = vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        json: async () => ({ messages: [{ id: "wamid.123" }] }),
      });

      const client = new MetaCloudApiChannel(config, mockFetch as unknown as typeof fetch);
      await client.sendTemplate("(11) 99999-8888", sampleTemplate);

      const calledBody = JSON.parse(mockFetch.mock.calls[0][1].body);
      expect(calledBody.to).toBe("5511999998888");
    });
  });
});
