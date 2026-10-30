import { describe, expect, it } from "vitest";
import {
  buildTemplatePayload,
  formatBookingDate,
  formatBookingTime,
  type TemplateData,
} from "@/server/whatsapp/templates";

describe("WhatsApp Templates Engine", () => {
  const baseData: TemplateData = {
    customerName: "Maria Silva",
    tenantName: "Studio Eneven",
    serviceName: "Corte e Hidratação",
    professionalName: "Bia Santos",
    startsAt: new Date("2030-10-15T17:30:00Z"),
    timezone: "America/Sao_Paulo",
    manageUrl: "https://agenda.eneven.com.br/agendamento/token-123",
    bookingId: "b0000000-0000-0000-0000-000000000001",
    manageToken: "token-123",
  };

  it("formata data e hora no fuso do estabelecimento", () => {
    // 17:30 UTC = 14:30 em São Paulo (UTC-3)
    const formattedDate = formatBookingDate(baseData.startsAt, baseData.timezone);
    const formattedTime = formatBookingTime(baseData.startsAt, baseData.timezone);

    expect(formattedTime).toBe("14:30");
    expect(formattedDate).toContain("15/10");
  });

  describe("booking_created", () => {
    it("monta parâmetros de confirmação imediata", () => {
      const payload = buildTemplatePayload("booking_created", baseData);
      expect(payload.name).toBe("booking_created");
      expect(payload.language.code).toBe("pt_BR");

      const body = payload.components.find((c) => c.type === "body");
      expect(body).toBeDefined();
      expect(body?.parameters).toEqual([
        { type: "text", text: "Maria Silva" },
        { type: "text", text: "Studio Eneven" },
        { type: "text", text: "Corte e Hidratação" },
        { type: "text", text: "Bia Santos" },
        { type: "text", text: expect.stringContaining("15/10") },
        { type: "text", text: "14:30" },
        { type: "text", text: "https://agenda.eneven.com.br/agendamento/token-123" },
      ]);
    });
  });

  describe("booking_reminder_eve", () => {
    it("monta parâmetros de lembrete de véspera com botões interativos", () => {
      const payload = buildTemplatePayload("booking_reminder_eve", baseData);
      expect(payload.name).toBe("booking_reminder_eve");

      const buttons = payload.components.filter((c) => c.type === "button");
      expect(buttons).toHaveLength(3);

      expect(buttons[0]).toEqual({
        type: "button",
        sub_type: "quick_reply",
        index: "0",
        parameters: [
          {
            type: "payload",
            payload: `CONFIRM:${baseData.bookingId}:${baseData.manageToken}`,
          },
        ],
      });

      expect(buttons[1]).toEqual({
        type: "button",
        sub_type: "quick_reply",
        index: "1",
        parameters: [
          {
            type: "payload",
            payload: `RESCHEDULE:${baseData.bookingId}:${baseData.manageToken}`,
          },
        ],
      });

      expect(buttons[2]).toEqual({
        type: "button",
        sub_type: "quick_reply",
        index: "2",
        parameters: [
          {
            type: "payload",
            payload: `CANCEL:${baseData.bookingId}:${baseData.manageToken}`,
          },
        ],
      });
    });
  });

  describe("booking_reminder_2h", () => {
    it("monta parâmetros de lembrete de 2 horas antes", () => {
      const payload = buildTemplatePayload("booking_reminder_2h", baseData);
      expect(payload.name).toBe("booking_reminder_2h");
      const buttons = payload.components.filter((c) => c.type === "button");
      expect(buttons).toHaveLength(2); // Confirmar e Cancelar
    });
  });

  describe("rescheduled & canceled", () => {
    it("monta notificação de remarcação", () => {
      const payload = buildTemplatePayload("rescheduled", baseData);
      expect(payload.name).toBe("booking_rescheduled");
      const body = payload.components.find((c) => c.type === "body");
      expect(body?.parameters).toBeDefined();
    });

    it("monta notificação de cancelamento", () => {
      const payload = buildTemplatePayload("canceled", baseData);
      expect(payload.name).toBe("booking_canceled");
    });
  });
});
