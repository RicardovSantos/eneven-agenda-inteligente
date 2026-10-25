"use server";

import { revalidatePath } from "next/cache";
import { unstable_rethrow } from "next/navigation";
import { getDb } from "@/db/client";
import { BookingError } from "@/server/agenda/errors";
import {
  cancelByToken,
  getManageView,
  listRescheduleDates,
  listRescheduleSlots,
  rescheduleByToken,
} from "@/server/public/manage";
import { rescheduleInputSchema, MESSAGES } from "@/server/public/schemas";
import type { PublicSlot } from "@/server/public/slots";
import { currentClientIp } from "@/server/security/client-ip";
import { limitManage, limitPublicRead } from "@/server/security/limits";
import { rateLimitMessage } from "@/server/security/rate-limit";

/**
 * Ações da página `/agendamento/{token}`. O token é a única credencial: o
 * agendamento (e o estabelecimento) são resolvidos por ele no servidor.
 */

type Failure = { ok: false; error: string };
type Done = { ok: true };

const GENERIC = "Não foi possível concluir agora. Tente novamente em instantes.";
const YMD = /^\d{4}-\d{2}-\d{2}$/;

/** Mensagem do prazo com o nome do salão ("Para remarcar ou cancelar, fale com …."). */
async function messageFor(error: BookingError, token: string): Promise<string> {
  if (error.code !== "outside_window") return error.message;
  const view = await getManageView(await getDb(), token);
  return view
    ? `Para remarcar ou cancelar, fale com ${view.tenant.name}.`
    : error.message;
}

export async function getRescheduleSlotsAction(
  token: string,
  date: string,
): Promise<{ ok: true; slots: PublicSlot[] } | Failure> {
  const limit = limitPublicRead(await currentClientIp());
  if (!limit.ok) return { ok: false, error: rateLimitMessage(limit.retryAfterSec) };
  if (typeof date !== "string" || !YMD.test(date)) return { ok: false, error: GENERIC };
  try {
    return { ok: true, slots: await listRescheduleSlots(await getDb(), token, date) };
  } catch (error) {
    unstable_rethrow(error);
    console.error("Falha ao listar horários de remarcação", error instanceof Error ? error.name : error);
    return { ok: false, error: GENERIC };
  }
}

export async function getRescheduleDatesAction(
  token: string,
  from: string,
): Promise<{ ok: true; dates: string[] } | Failure> {
  const limit = limitPublicRead(await currentClientIp());
  if (!limit.ok) return { ok: false, error: rateLimitMessage(limit.retryAfterSec) };
  if (typeof from !== "string" || !YMD.test(from)) return { ok: false, error: GENERIC };
  try {
    return { ok: true, dates: await listRescheduleDates(await getDb(), token, from) };
  } catch (error) {
    unstable_rethrow(error);
    console.error("Falha ao listar datas de remarcação", error instanceof Error ? error.name : error);
    return { ok: false, error: GENERIC };
  }
}

export async function rescheduleAction(token: string, input: unknown): Promise<Done | Failure> {
  const limit = limitManage(await currentClientIp());
  if (!limit.ok) return { ok: false, error: rateLimitMessage(limit.retryAfterSec) };
  const parsed = rescheduleInputSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: GENERIC };
  try {
    await rescheduleByToken(await getDb(), token, parsed.data.startsAt);
    revalidatePath("/agendamento/[token]", "page");
    return { ok: true };
  } catch (error) {
    if (error instanceof BookingError) return { ok: false, error: await messageFor(error, token) };
    unstable_rethrow(error);
    console.error("Falha ao remarcar", error instanceof Error ? error.name : error);
    return { ok: false, error: MESSAGES.generic };
  }
}

export async function cancelAction(token: string): Promise<Done | Failure> {
  const limit = limitManage(await currentClientIp());
  if (!limit.ok) return { ok: false, error: rateLimitMessage(limit.retryAfterSec) };
  try {
    await cancelByToken(await getDb(), token);
    revalidatePath("/agendamento/[token]", "page");
    return { ok: true };
  } catch (error) {
    if (error instanceof BookingError) return { ok: false, error: await messageFor(error, token) };
    unstable_rethrow(error);
    console.error("Falha ao cancelar", error instanceof Error ? error.name : error);
    return { ok: false, error: GENERIC };
  }
}
