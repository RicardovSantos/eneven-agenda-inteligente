import { and, desc, eq, inArray } from "drizzle-orm";
import { bookings, tenants, whatsappMessages } from "@/db/schema";
import type { Db } from "@/db/types";
import { cancelBooking, findBookingByManageToken, setBookingStatus } from "@/server/agenda/bookings";
import { BookingError } from "@/server/agenda/errors";
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
): Promise<{ ok: boolean; action?: string; error?: string; uncertain?: boolean }> {
  const parts = buttonId.split(":");
  if (parts.length !== 3 || !parts[2]) return { ok: false, error: "Payload inválido" };

  const [action, bookingId, manageToken] = parts;
  const verified = await findBookingByManageToken(db, manageToken);
  if (!verified || verified.bookingId !== bookingId) {
    return { ok: false, error: "Token de gerenciamento inválido" };
  }
  const [booking] = await withTenant(db, verified.tenantId, (tx) =>
    tx.select({ status: bookings.status }).from(bookings).where(eq(bookings.id, bookingId)).limit(1),
  );
  if (!booking) return { ok: false, error: "Agendamento não encontrado" };

  switch (action) {
    case "CONFIRM": {
      if (booking.status === "scheduled") {
        await setBookingStatus(db, verified.tenantId, bookingId, "confirmed");
      }
      if (booking.status !== "scheduled" && booking.status !== "confirmed") {
        return { ok: false, error: "Agendamento não pode ser confirmado." };
      }
      return { ok: true, action: "confirmed" };
    }

    case "CANCEL": {
      if (booking.status !== "canceled") {
        try {
          await cancelBooking(db, verified.tenantId, bookingId, "customer");
        } catch (error) {
          if (!(error instanceof BookingError)) throw error;
          return { ok: false, error: "Não foi possível cancelar este agendamento." };
        }
      }
      return { ok: true, action: "canceled" };
    }

    case "RESCHEDULE": {
      const channel = getWhatsAppChannel();
      const link = `${appUrl()}/agendamento/${encodeURIComponent(manageToken)}`;
      const sent = await channel.sendTextMessage(
        fromPhone,
        `Para escolher um novo horário para o seu agendamento, toque no link a seguir:\n${link}`,
      );
      return sent.ok ? { ok: true, action: "reschedule_link_sent" } : { ok: false, error: sent.error, uncertain: true };
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
    .where(and(
      eq(whatsappMessages.recipientPhone, fromPhone),
      eq(whatsappMessages.direction, "outbound"),
      inArray(whatsappMessages.status, ["sent", "delivered", "read"]),
    ))
    .orderBy(desc(whatsappMessages.createdAt))
    .limit(1);

  if (!lastMsg) {
    return { ok: true };
  }

  const [tenant] = await db
    .select({
      id: tenants.id,
      name: tenants.name,
      whatsapp: tenants.whatsapp,
    })
    .from(tenants)
    .where(eq(tenants.id, lastMsg.tenantId))
    .limit(1);

  if (!tenant) return { ok: true };

  const channel = getWhatsAppChannel();
  const link = tenant.whatsapp ? `https://wa.me/${tenant.whatsapp.replace(/\D/g, "")}` : null;
  const text = `Olá! Esta é uma mensagem automática da Eneven. Para falar com ${tenant.name}, ${link ? `acesse ${link}` : "consulte o número de atendimento do estabelecimento"}.`;

  return { ok: (await channel.sendTextMessage(fromPhone, text)).ok };
}
