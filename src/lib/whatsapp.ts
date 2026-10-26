import { formatLongDate } from "@/lib/dates";
import { normalizeBrazilPhone } from "@/lib/phone";

/**
 * Textos prontos e link do WhatsApp para o painel. Funções puras (servidor e
 * navegador). `date` é "yyyy-MM-dd" no fuso do estabelecimento; `time` "14:30".
 */

export type WhatsAppBooking = {
  /** Nome completo do cliente (a mensagem usa só o primeiro nome). */
  name: string;
  /** Serviço(s) já juntos ("Piercing hélix e Troca de joia"). */
  service: string;
  business: string;
  date: string;
  time: string;
};

export function firstName(name: string): string {
  return name.trim().split(/\s+/)[0] ?? "";
}

/** "2026-10-27" -> "terça, 27 de outubro" (no meio da frase). */
function dayInSentence(date: string): string {
  const long = formatLongDate(date);
  return long.charAt(0).toLowerCase() + long.slice(1);
}

export function joinServices(names: string[]): string {
  if (names.length <= 1) return names[0] ?? "";
  return `${names.slice(0, -1).join(", ")} e ${names[names.length - 1]}`;
}

export function rescheduledText(b: WhatsAppBooking): string {
  return `Olá, ${firstName(b.name)}! Seu horário de ${b.service} no ${b.business} foi remarcado para ${dayInSentence(b.date)} às ${b.time}.`;
}

export function canceledText(b: WhatsAppBooking): string {
  return `Olá, ${firstName(b.name)}! Seu horário de ${b.service} no ${b.business} em ${dayInSentence(b.date)} às ${b.time} foi cancelado.`;
}

export function reminderText(b: WhatsAppBooking & { link: string }): string {
  return `Olá, ${firstName(b.name)}! Lembrando do seu horário de ${b.service} no ${b.business} ${dayInSentence(b.date)} às ${b.time}. Para confirmar ou remarcar: ${b.link}`;
}

/** `https://wa.me/{telefone}?text=...`. Telefone com ou sem máscara/55. */
export function buildWhatsAppLink(phone: string, text: string): string {
  const digits = normalizeBrazilPhone(phone) ?? phone.replace(/\D/g, "");
  return `https://wa.me/${digits}?text=${encodeURIComponent(text)}`;
}
