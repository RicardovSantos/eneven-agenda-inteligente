"use server";

import { revalidatePath } from "next/cache";
import { unstable_rethrow } from "next/navigation";
import { z } from "zod";
import { getDb } from "@/db/client";
import type { Db } from "@/db/types";
import { normalizeBrazilPhone } from "@/lib/phone";
import { BookingError } from "@/server/agenda/errors";
import {
  cancelBookingAsStaff,
  completeBooking,
  confirmBooking,
  createBlock,
  createPanelBooking,
  deleteBlock,
  issueManageLink,
  listPanelDates,
  listPanelSlots,
  noShowBooking,
  rescheduleBookingAsStaff,
  searchCustomers,
  undoBookingStatus,
  type CustomerHit,
  type PanelActor,
} from "@/server/agenda/panel-ops";
import { requireTenantSession } from "@/server/auth/guard";
import { isRealDate } from "@/server/public/schemas";

/**
 * Ações da agenda do painel. O estabelecimento e o papel vêm sempre da sessão;
 * nada disso chega do cliente. A regra de quem pode agir em quê mora em
 * `server/agenda/panel-ops.ts`.
 */

export type PanelActionResult =
  | { ok: true; message: string; whatsappUrl?: string; id?: string }
  | { ok: false; error: string };

const GENERIC_ERROR = "Não foi possível concluir agora. Tente novamente em instantes.";

async function actorFromSession(): Promise<PanelActor> {
  const session = await requireTenantSession();
  return { tenantId: session.tenantId, userId: session.userId, role: session.role! };
}

function failure(error: unknown, label: string): { ok: false; error: string } {
  if (error instanceof BookingError) return { ok: false, error: error.message };
  if (error instanceof z.ZodError) {
    return { ok: false, error: error.issues[0]?.message ?? GENERIC_ERROR };
  }
  // Redirecionamentos do Next (sessão ausente) precisam seguir adiante.
  unstable_rethrow(error);
  console.error(`Falha em ${label}`, error instanceof Error ? error.name : error);
  return { ok: false, error: GENERIC_ERROR };
}

async function run(
  label: string,
  message: string,
  work: (ctx: { db: Db; actor: PanelActor }) => Promise<{ whatsappUrl?: string; id?: string } | void>,
): Promise<PanelActionResult> {
  try {
    const actor = await actorFromSession();
    const result = await work({ db: await getDb(), actor });
    revalidatePath("/painel");
    return { ok: true, message, ...(result ?? {}) };
  } catch (error) {
    return failure(error, label);
  }
}

const id = z.string().min(1).max(64);

export async function confirmBookingAction(bookingId: string) {
  return run("confirmar agendamento", "Presença confirmada", ({ db, actor }) =>
    confirmBooking(db, actor, id.parse(bookingId)),
  );
}

export async function completeBookingAction(bookingId: string) {
  return run("concluir agendamento", "Marcado como atendido", ({ db, actor }) =>
    completeBooking(db, actor, id.parse(bookingId)),
  );
}

export async function noShowBookingAction(bookingId: string) {
  return run("marcar falta", "Marcado como faltou", ({ db, actor }) =>
    noShowBooking(db, actor, id.parse(bookingId)),
  );
}

export async function undoStatusAction(bookingId: string) {
  return run("desfazer status", "Status desfeito", ({ db, actor }) =>
    undoBookingStatus(db, actor, id.parse(bookingId)),
  );
}

export async function cancelBookingAction(bookingId: string) {
  return run("cancelar agendamento", "Agendamento cancelado", ({ db, actor }) =>
    cancelBookingAsStaff(db, actor, id.parse(bookingId)),
  );
}

const isoInstant = z.iso.datetime({ offset: true, error: "Data ou horário inválido." });

export async function rescheduleBookingAction(bookingId: string, startsAt: string) {
  return run("remarcar agendamento", "Agendamento remarcado", ({ db, actor }) =>
    rescheduleBookingAsStaff(db, actor, id.parse(bookingId), isoInstant.parse(startsAt)),
  );
}

/** Gera um link de gestão novo e devolve o lembrete pronto para o WhatsApp. */
export async function issueManageLinkAction(bookingId: string) {
  return run("gerar lembrete", "Lembrete pronto", ({ db, actor }) =>
    issueManageLink(db, actor, id.parse(bookingId)),
  );
}

const createBookingSchema = z.object({
  serviceIds: z.array(z.uuid()).min(1, "Escolha ao menos um serviço.").max(20),
  professionalId: z.union([z.literal("any"), z.uuid()]),
  startsAt: isoInstant,
  name: z.string().trim().min(2, "Informe o nome do cliente.").max(80, "Use até 80 caracteres no nome."),
  phone: z
    .string()
    .max(32)
    .refine((v) => normalizeBrazilPhone(v) !== null, "Informe um WhatsApp com DDD."),
  email: z.string().trim().max(160).optional(),
  notes: z.string().trim().max(300, "Use até 300 caracteres na observação.").optional(),
  allowOutsideHours: z.boolean().optional(),
});

export async function createBookingAction(input: unknown) {
  return run("criar agendamento", "Agendamento criado", async ({ db, actor }) => {
    const data = createBookingSchema.parse(input);
    const { bookingId } = await createPanelBooking(db, actor, data);
    return { id: bookingId };
  });
}

export async function searchCustomersAction(query: string): Promise<CustomerHit[]> {
  try {
    const actor = await actorFromSession();
    return await searchCustomers(await getDb(), actor, String(query));
  } catch (error) {
    unstable_rethrow(error);
    return [];
  }
}

const blockSchema = z.object({
  professionalId: z.union([z.literal("all"), z.uuid()]),
  startsAt: isoInstant,
  endsAt: isoInstant,
  reason: z.string().trim().max(120, "Use até 120 caracteres no motivo.").optional(),
});

export async function createBlockAction(input: unknown) {
  return run("bloquear horário", "Horário bloqueado", async ({ db, actor }) => {
    const data = blockSchema.parse(input);
    const { id: blockId } = await createBlock(db, actor, {
      professionalId: data.professionalId === "all" ? null : data.professionalId,
      startsAt: data.startsAt,
      endsAt: data.endsAt,
      reason: data.reason ?? null,
    });
    return { id: blockId };
  });
}

export async function deleteBlockAction(blockId: string) {
  return run("remover bloqueio", "Bloqueio removido", ({ db, actor }) =>
    deleteBlock(db, actor, id.parse(blockId)),
  );
}

// --- Horários livres (seletor de dia e horário do painel) -------------------

type Result<T> = { ok: true; data: T } | { ok: false; error: string };
const LOAD_ERROR = "Não foi possível carregar os horários. Tente novamente.";

const date = z.string().refine(isRealDate, "Data inválida.");
const selection = {
  serviceIds: z.array(z.uuid()).max(20).optional(),
  professionalId: z.union([z.literal("any"), z.uuid()]).optional(),
  bookingId: z.string().max(64).optional(),
};

export async function getPanelSlotsAction(input: unknown) {
  try {
    const data = z.object({ ...selection, date }).parse(input);
    const actor = await actorFromSession();
    return {
      ok: true,
      data: await listPanelSlots(await getDb(), actor, data),
    } satisfies Result<Awaited<ReturnType<typeof listPanelSlots>>>;
  } catch (error) {
    return failureResult(error);
  }
}

export async function getPanelDatesAction(input: unknown) {
  try {
    const data = z.object({ ...selection, from: date }).parse(input);
    const actor = await actorFromSession();
    return {
      ok: true,
      data: await listPanelDates(await getDb(), actor, data),
    } satisfies Result<string[]>;
  } catch (error) {
    return failureResult(error);
  }
}

function failureResult(error: unknown): { ok: false; error: string } {
  if (error instanceof BookingError) return { ok: false, error: error.message };
  if (error instanceof z.ZodError) return { ok: false, error: LOAD_ERROR };
  unstable_rethrow(error);
  console.error("Falha ao listar horários do painel", error instanceof Error ? error.name : error);
  return { ok: false, error: LOAD_ERROR };
}
