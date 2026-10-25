import type { Db } from "@/db/types";
import { BookingError, type BookingErrorCode } from "@/server/agenda/errors";
import { createBooking } from "@/server/agenda/bookings";
import { limitBooking } from "@/server/security/limits";
import { rateLimitMessage } from "@/server/security/rate-limit";
import { bookInputSchema, fieldErrorsOf, MESSAGES } from "./schemas";
import { getPublicTenant } from "./tenant";
import { getBookingView, type BookingView } from "./view";

export type BookFailure = {
  ok: false;
  code: "validation" | "rate_limited" | "unavailable" | BookingErrorCode | "error";
  error: string;
  fieldErrors?: Record<string, string>;
};

export type BookResult =
  | {
      ok: true;
      /** Token do link de gestão: vai só para esta resposta e para a URL de `/agendamento/{token}`. */
      token: string;
      booking: BookingView;
    }
  | BookFailure;

/**
 * Reserva pela página pública. Valida (inclusive o consentimento), aplica o
 * limite (10 / 10 min por IP, 5 / h por telefone), resolve o estabelecimento
 * pelo slug e cria o agendamento com origem `public` (o serviço de reservas
 * revalida expediente, antecedência, conflito e seleção). O token de gestão
 * nunca é registrado em log.
 */
export async function bookPublic(
  db: Db,
  slug: string,
  rawInput: unknown,
  context: { ip: string; now?: Date },
): Promise<BookResult> {
  const parsed = bookInputSchema.safeParse(rawInput);
  if (!parsed.success) {
    const fieldErrors = fieldErrorsOf(parsed.error);
    return {
      ok: false,
      code: "validation",
      error: Object.values(fieldErrors)[0] ?? "Confira os dados informados.",
      fieldErrors,
    };
  }
  const input = parsed.data;

  const limit = limitBooking(context.ip, input.phone);
  if (!limit.ok) {
    return { ok: false, code: "rate_limited", error: rateLimitMessage(limit.retryAfterSec) };
  }

  const now = context.now ?? new Date();
  const resolved = await getPublicTenant(slug, { db, now });
  if (!resolved || !resolved.canBook) {
    return { ok: false, code: "unavailable", error: MESSAGES.unavailable };
  }

  try {
    const { bookingId, manageToken } = await createBooking(
      db,
      resolved.tenant.id,
      {
        serviceIds: input.serviceIds,
        professionalId: input.professionalId,
        startsAt: new Date(input.startsAt),
        customer: { name: input.name, phone: input.phone, email: input.email || null },
        source: "public",
      },
      now,
    );
    const booking = await getBookingView(db, resolved.tenant.id, bookingId, resolved.tenant.timezone);
    return { ok: true, token: manageToken, booking };
  } catch (error) {
    if (error instanceof BookingError) {
      return { ok: false, code: error.code, error: error.message };
    }
    console.error("Falha ao criar agendamento público", error instanceof Error ? error.name : error);
    return { ok: false, code: "error", error: MESSAGES.generic };
  }
}
