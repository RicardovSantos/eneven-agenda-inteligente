import { desc, eq } from "drizzle-orm";
import { bookings, tenants, whatsappMessages } from "@/db/schema";
import type { Db } from "@/db/types";
import { hashToken } from "@/server/auth/session";
import { appUrl } from "@/server/email/templates";
import { withTenant } from "@/server/tenant-db";
import { getWhatsAppChannel } from "./channel";

/**
 * Processa resposta interativa de botão (Confirmar, Remarcar ou Cancelar).
 */
export async function processInteractiveButtonReply(
  db: Db,
  buttonId: string,
  fromPhone: string,
): Promise<{ ok: boolean; action?: string; error?: string }> {
  const parts = buttonId.split(":");
  if (parts.length < 3) return { ok: false, error: "Payload inválido" };

  const [action, bookingId, manageToken] = parts;
  const tokenHash = hashToken(manageToken);

  // Busca o agendamento conferindo o hash do token (segurança)
  const [booking] = await db
    .select({
      id: bookings.id,
      tenantId: bookings.tenantId,
      status: bookings.status,
    })
    .from(bookings)
    .where(eq(bookings.id, bookingId))
    .limit(1);

  if (!booking) return { ok: false, error: "Agendamento não encontrado" };

  // Confere token
  const [verified] = await db
    .select({ id: bookings.id })
    .from(bookings)
    .where(eq(bookings.manageTokenHash, tokenHash))
    .limit(1);

  if (!verified || verified.id !== bookingId) {
    return { ok: false, error: "Token de gerenciamento inválido" };
  }

  const now = new Date();

  switch (action) {
    case "CONFIRM": {
      if (booking.status === "scheduled") {
        await withTenant(db, booking.tenantId, (tx) =>
          tx
            .update(bookings)
            .set({ status: "confirmed", updatedAt: now })
            .where(eq(bookings.id, bookingId)),
        );
      }
      return { ok: true, action: "confirmed" };
    }

    case "CANCEL": {
      if (booking.status !== "canceled") {
        await withTenant(db, booking.tenantId, (tx) =>
          tx
            .update(bookings)
            .set({
              status: "canceled",
              canceledBy: "customer",
              canceledAt: now,
              updatedAt: now,
            })
            .where(eq(bookings.id, bookingId)),
        );
      }
      return { ok: true, action: "canceled" };
    }

    case "RESCHEDULE": {
      const channel = getWhatsAppChannel();
      const link = `${appUrl()}/agendamento/${encodeURIComponent(manageToken)}`;
      await channel.sendTextMessage(
        fromPhone,
        `Para escolher um novo horário para o seu agendamento, toque no link a seguir:\n${link}`,
      );
      return { ok: true, action: "reschedule_link_sent" };
    }

    default:
      return { ok: false, error: "Ação desconhecida" };
  }
}

/**
 * Responde mensagens livres de texto com link direto para o WhatsApp do estabelecimento.
 */
export async function processFreeTextMessage(
  db: Db,
  fromPhone: string,
): Promise<{ ok: boolean }> {
  // Localiza o último estabelecimento que enviou mensagem para este número
  const [lastMsg] = await db
    .select({ tenantId: whatsappMessages.tenantId })
    .from(whatsappMessages)
    .where(eq(whatsappMessages.recipientPhone, fromPhone))
    .orderBy(desc(whatsappMessages.createdAt))
    .limit(1);

  if (!lastMsg) {
    return { ok: true };
  }

  const [tenant] = await db
    .select({
      id: tenants.id,
      name: tenants.name,
    })
    .from(tenants)
    .where(eq(tenants.id, lastMsg.tenantId))
    .limit(1);

  if (!tenant) return { ok: true };

  const channel = getWhatsAppChannel();
  const text = `Olá! Esta é uma mensagem automática de confirmações e lembretes da plataforma Eneven. Para falar diretamente com o estabelecimento ${tenant.name}, entre em contato pelo número de atendimento deles.`;

  await channel.sendTextMessage(fromPhone, text);
  return { ok: true };
}
