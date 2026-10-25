"use server";

import { unstable_rethrow } from "next/navigation";
import { getDb } from "@/db/client";
import { BookingError } from "@/server/agenda/errors";
import { bookPublic, type BookResult } from "@/server/public/booking";
import {
  datesInputSchema,
  MESSAGES,
  slotsInputSchema,
} from "@/server/public/schemas";
import { listPublicDates, listPublicSlots, type PublicSlot } from "@/server/public/slots";
import { getPublicTenant } from "@/server/public/tenant";
import { currentClientIp } from "@/server/security/client-ip";
import { limitPublicRead } from "@/server/security/limits";
import { rateLimitMessage } from "@/server/security/rate-limit";

/**
 * Ações da página pública. O estabelecimento é sempre resolvido de novo pelo
 * `slug` no servidor (a cada chamada); nenhum id de estabelecimento vem do
 * cliente e nada aqui exige sessão.
 */

type Failure = { ok: false; error: string };

const GENERIC_READ_ERROR = "Não foi possível carregar os horários agora. Tente novamente.";

async function resolveForRead(slug: string): Promise<{ tenantId: string } | Failure> {
  const limit = limitPublicRead(await currentClientIp());
  if (!limit.ok) return { ok: false, error: rateLimitMessage(limit.retryAfterSec) };
  const resolved = await getPublicTenant(slug);
  if (!resolved || !resolved.canBook) return { ok: false, error: MESSAGES.unavailable };
  return { tenantId: resolved.tenant.id };
}

export async function getSlotsAction(
  slug: string,
  input: unknown,
): Promise<{ ok: true; slots: PublicSlot[] } | Failure> {
  const parsed = slotsInputSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: GENERIC_READ_ERROR };
  try {
    const tenant = await resolveForRead(slug);
    if ("ok" in tenant) return tenant;
    const slots = await listPublicSlots(await getDb(), tenant.tenantId, parsed.data);
    return { ok: true, slots };
  } catch (error) {
    if (error instanceof BookingError) return { ok: false, error: error.message };
    unstable_rethrow(error);
    console.error("Falha ao listar horários públicos", error instanceof Error ? error.name : error);
    return { ok: false, error: GENERIC_READ_ERROR };
  }
}

export async function getDatesAction(
  slug: string,
  input: unknown,
): Promise<{ ok: true; dates: string[] } | Failure> {
  const parsed = datesInputSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: GENERIC_READ_ERROR };
  try {
    const tenant = await resolveForRead(slug);
    if ("ok" in tenant) return tenant;
    const dates = await listPublicDates(await getDb(), tenant.tenantId, parsed.data);
    return { ok: true, dates };
  } catch (error) {
    if (error instanceof BookingError) return { ok: false, error: error.message };
    unstable_rethrow(error);
    console.error("Falha ao listar datas públicas", error instanceof Error ? error.name : error);
    return { ok: false, error: GENERIC_READ_ERROR };
  }
}

/** Reserva e devolve o resultado (a tela mostra a confirmação ou o erro no próprio lugar). */
export async function bookAction(slug: string, input: unknown): Promise<BookResult> {
  try {
    return await bookPublic(await getDb(), slug, input, { ip: await currentClientIp() });
  } catch (error) {
    unstable_rethrow(error);
    console.error("Falha ao reservar", error instanceof Error ? error.name : error);
    return { ok: false, code: "error", error: MESSAGES.generic };
  }
}
