import { describe, expect, it } from "vitest";
import {
  buildWhatsAppLink,
  canceledText,
  firstName,
  reminderText,
  rescheduledText,
} from "@/lib/whatsapp";

const base = {
  name: "Paula Mendes",
  service: "Piercing septo",
  business: "Studio Defendi",
  date: "2026-10-27",
  time: "15:30",
};

describe("textos do WhatsApp", () => {
  it("remarcado", () => {
    expect(rescheduledText(base)).toBe(
      "Olá, Paula! Seu horário de Piercing septo no Studio Defendi foi remarcado para terça, 27 de outubro às 15:30.",
    );
  });

  it("cancelado", () => {
    expect(canceledText(base)).toBe(
      "Olá, Paula! Seu horário de Piercing septo no Studio Defendi em terça, 27 de outubro às 15:30 foi cancelado.",
    );
  });

  it("lembrete com o link de gestão", () => {
    expect(reminderText({ ...base, link: "https://x.test/agendamento/abc" })).toBe(
      "Olá, Paula! Lembrando do seu horário de Piercing septo no Studio Defendi terça, 27 de outubro às 15:30. Para confirmar ou remarcar: https://x.test/agendamento/abc",
    );
  });

  it("primeiro nome", () => {
    expect(firstName("  Ana  Souza ")).toBe("Ana");
    expect(firstName("")).toBe("");
  });

  it("link wa.me com o telefone só em dígitos e o texto codificado", () => {
    const url = buildWhatsAppLink("(11) 98765-4321", "Olá, Ana! Tudo bem?");
    expect(url).toBe("https://wa.me/5511987654321?text=Ol%C3%A1%2C%20Ana!%20Tudo%20bem%3F");
    expect(buildWhatsAppLink("5511987654321", "x")).toBe("https://wa.me/5511987654321?text=x");
  });
});
