import { randomBytes } from "node:crypto";
import { and, asc, eq, inArray } from "drizzle-orm";
import { z } from "zod";
import {
  bookingServices,
  bookings,
  customers,
  professionals,
  tenants,
  timeBlocks,
} from "@/db/schema";
import type { Db } from "@/db/types";
import { formatTime } from "@/lib/dates";
import {
  buildWhatsAppLink,
  canceledText,
  joinServices,
  reminderText,
  rescheduledText,
} from "@/lib/whatsapp";
import { hashToken } from "@/server/auth/session";
import { appUrl } from "@/server/email/templates";
import { withTenant } from "@/server/tenant-db";
import { isTenantActive } from "@/server/tenants/release";
import { getAvailableDates, getAvailableSlots } from "./availability";
import {
  PANEL_RULES,
  cancelBooking,
  createBooking,
  rescheduleBooking,
  setBookingStatus,
} from "./bookings";
import { customerMatch } from "./customer-search";
import { BookingError } from "./errors";
import { loadAvailabilityContext } from "./load";
import { findStaffProfessional } from "./panel-queries";
import { localDateOf } from "./time";

/**
 * Operações do painel. Todas recebem o `PanelActor` (sessão: tenant, usuário e
 * papel) e aplicam o modelo de permissão:
 *  - proprietário e recepção enxergam e agem em todos os agendamentos;
 *  - profissional (`staff`) só no que é do profissional ligado ao seu usuário
 *    (`professionals.user_id`). Fora disso (ou de outro estabelecimento) o
 *    resultado é sempre "Agendamento não encontrado.", sem revelar que existe.
 */

export type PanelActor = {
  tenantId: string;
  userId: string;
  role: "owner" | "reception" | "staff";
};

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const notFound = () => new BookingError("not_found");
const blockNotFound = () => new BookingError("not_found", "Bloqueio não encontrado.");

/** `null` = sem restrição; string = o único profissional que o usuário pode ver (resolvedor compartilhado com a página). */
export async function staffProfessionalId(db: Db, actor: PanelActor): Promise<string | null> {
  if (actor.role !== "staff") return null;
  const own = await findStaffProfessional(db, actor.tenantId, actor.userId);
  // Profissional sem vínculo (ou inativo) não enxerga nada.
  return own?.id ?? "00000000-0000-0000-0000-000000000000";
}

/** Profissional a usar nas consultas: o do filtro, ou o do próprio `staff`. */
export async function scopedProfessionalId(
  db: Db,
  actor: PanelActor,
  requested?: string,
): Promise<string | undefined> {
  const own = await staffProfessionalId(db, actor);
  return own ?? requested;
}

/**
 * Estabelecimento inativo (teste vencido, bloqueado, cancelado, pagamento
 * atrasado) fica em modo somente leitura: não cria nem move agenda. Cancelar e
 * marcar o resultado de um atendimento continuam permitidos.
 *
 * A checagem roda antes da escrita, em transação própria (não na mesma). É
 * aceitável: o estado só muda por ação do dono da plataforma, e uma escrita
 * que corra junto com o bloqueio é uma janela de milissegundos sem efeito
 * além de um agendamento a mais.
 */
async function assertWritable(db: Db, tenantId: string, now: Date): Promise<void> {
  const [row] = await withTenant(db, tenantId, (tx) =>
    tx
      .select({ status: tenants.status, trialEndsAt: tenants.trialEndsAt })
      .from(tenants)
      .where(eq(tenants.id, tenantId))
      .limit(1),
  );
  if (!row || !isTenantActive(row, now)) throw new BookingError("read_only");
}

async function loadOwned(db: Db, actor: PanelActor, bookingId: string) {
  if (!UUID.test(bookingId)) throw notFound();
  const own = await staffProfessionalId(db, actor);
  const [row] = await withTenant(db, actor.tenantId, (tx) =>
    tx
      .select()
      .from(bookings)
      .where(and(eq(bookings.tenantId, actor.tenantId), eq(bookings.id, bookingId)))
      .limit(1),
  );
  if (!row || (own !== null && row.professionalId !== own)) throw notFound();
  return row;
}

export async function confirmBooking(db: Db, actor: PanelActor, bookingId: string): Promise<void> {
  await loadOwned(db, actor, bookingId);
  await setBookingStatus(db, actor.tenantId, bookingId, "confirmed");
}

export async function completeBooking(db: Db, actor: PanelActor, bookingId: string): Promise<void> {
  await loadOwned(db, actor, bookingId);
  await setBookingStatus(db, actor.tenantId, bookingId, "completed");
}

export async function noShowBooking(db: Db, actor: PanelActor, bookingId: string): Promise<void> {
  await loadOwned(db, actor, bookingId);
  await setBookingStatus(db, actor.tenantId, bookingId, "no_show");
}

/** Volta para "Agendado" (desfazer confirmação, atendido ou falta). */
export async function undoBookingStatus(db: Db, actor: PanelActor, bookingId: string): Promise<void> {
  await loadOwned(db, actor, bookingId);
  await setBookingStatus(db, actor.tenantId, bookingId, "scheduled");
}

/** Dados para os textos de WhatsApp, lidos do estado atual do agendamento. */
async function notificationData(db: Db, tenantId: string, bookingId: string) {
  return withTenant(db, tenantId, async (tx) => {
    const [row] = await tx
      .select({
        startsAt: bookings.startsAt,
        customerName: customers.name,
        customerPhone: customers.phone,
        business: tenants.name,
        timezone: tenants.timezone,
      })
      .from(bookings)
      .innerJoin(customers, eq(customers.id, bookings.customerId))
      .innerJoin(tenants, eq(tenants.id, bookings.tenantId))
      .where(and(eq(bookings.tenantId, tenantId), eq(bookings.id, bookingId)))
      .limit(1);
    if (!row) throw notFound();
    const lines = await tx
      .select({ name: bookingServices.name })
      .from(bookingServices)
      .where(and(eq(bookingServices.tenantId, tenantId), eq(bookingServices.bookingId, bookingId)))
      .orderBy(asc(bookingServices.position));
    return {
      phone: row.customerPhone,
      booking: {
        name: row.customerName,
        service: joinServices(lines.map((l) => l.name)),
        business: row.business,
        date: localDateOf(row.startsAt, row.timezone),
        time: formatTime(row.startsAt, row.timezone),
      },
    };
  });
}

export async function cancelBookingAsStaff(
  db: Db,
  actor: PanelActor,
  bookingId: string,
  now: Date = new Date(),
): Promise<{ whatsappUrl: string }> {
  await loadOwned(db, actor, bookingId);
  await cancelBooking(db, actor.tenantId, bookingId, "staff", now);
  const { phone, booking } = await notificationData(db, actor.tenantId, bookingId);
  return { whatsappUrl: buildWhatsAppLink(phone, canceledText(booking)) };
}

export async function rescheduleBookingAsStaff(
  db: Db,
  actor: PanelActor,
  bookingId: string,
  startsAtIso: string,
  professionalId?: string,
  now: Date = new Date(),
): Promise<{ whatsappUrl: string }> {
  await assertWritable(db, actor.tenantId, now);
  await loadOwned(db, actor, bookingId);
  const startsAt = parseInstant(startsAtIso);
  const targetPro = (await scopedProfessionalId(db, actor, professionalId)) ?? undefined;
  await rescheduleBooking(db, actor.tenantId, bookingId, startsAt, "staff", now, targetPro);
  const { phone, booking } = await notificationData(db, actor.tenantId, bookingId);
  return { whatsappUrl: buildWhatsAppLink(phone, rescheduledText(booking)) };
}

function parseInstant(value: string): Date {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) throw new BookingError("invalid_selection", "Data ou horário inválido.");
  return date;
}

export type PanelBookingInput = {
  serviceIds: string[];
  professionalId: string | "any";
  startsAt: string;
  name: string;
  phone: string;
  email?: string | null;
  notes?: string;
  allowOutsideHours?: boolean;
};

export async function createPanelBooking(
  db: Db,
  actor: PanelActor,
  input: PanelBookingInput,
  now: Date = new Date(),
): Promise<{ bookingId: string }> {
  await assertWritable(db, actor.tenantId, now);
  const own = await staffProfessionalId(db, actor);
  const email = input.email?.trim() || null;
  if (email && !z.email().safeParse(email).success) {
    throw new BookingError("invalid_selection", "Informe um e-mail válido ou deixe em branco.");
  }
  const { bookingId } = await createBooking(
    db,
    actor.tenantId,
    {
      serviceIds: input.serviceIds,
      professionalId: own ?? input.professionalId,
      startsAt: parseInstant(input.startsAt),
      customer: { name: input.name, phone: input.phone, email },
      source: "panel",
      notes: input.notes?.trim() || undefined,
      createdByUserId: actor.userId,
      allowOutsideHours: input.allowOutsideHours === true,
      // Profissional não altera dados de cliente existente; recepção e proprietário sim.
      preserveCustomerData: actor.role === "staff",
    },
    now,
  );
  return { bookingId };
}

export type CustomerHit = { id: string; name: string; phone: string };

/** Clientes por nome ou telefone (até 8). `staff` só vê quem já foi atendido por ele. */
export async function searchCustomers(db: Db, actor: PanelActor, query: string): Promise<CustomerHit[]> {
  const q = query.trim().slice(0, 80);
  if (q.length < 2) return [];
  const own = await staffProfessionalId(db, actor);
  return withTenant(db, actor.tenantId, (tx) =>
    tx
      .select({ id: customers.id, name: customers.name, phone: customers.phone })
      .from(customers)
      .where(
        and(
          eq(customers.tenantId, actor.tenantId),
          customerMatch(q),
          own
            ? inArray(
                customers.id,
                tx
                  .select({ id: bookings.customerId })
                  .from(bookings)
                  .where(and(eq(bookings.tenantId, actor.tenantId), eq(bookings.professionalId, own))),
              )
            : undefined,
        ),
      )
      .orderBy(asc(customers.name), asc(customers.id))
      .limit(8),
  );
}

export type BlockInput = {
  /** `null` = estabelecimento todo (`staff` sempre usa o próprio profissional). */
  professionalId: string | null;
  startsAt: string;
  endsAt: string;
  reason: string | null;
};

export async function createBlock(
  db: Db,
  actor: PanelActor,
  input: BlockInput,
  now: Date = new Date(),
): Promise<{ id: string }> {
  await assertWritable(db, actor.tenantId, now);
  const startsAt = parseInstant(input.startsAt);
  const endsAt = parseInstant(input.endsAt);
  if (endsAt.getTime() <= startsAt.getTime()) {
    throw new BookingError("invalid_selection", "O fim precisa ser depois do início.");
  }
  const own = await staffProfessionalId(db, actor);
  const professionalId = own ?? input.professionalId;
  return withTenant(db, actor.tenantId, async (tx) => {
    if (professionalId !== null) {
      if (!UUID.test(professionalId)) throw new BookingError("invalid_selection");
      const [pro] = await tx
        .select({ id: professionals.id })
        .from(professionals)
        .where(and(eq(professionals.tenantId, actor.tenantId), eq(professionals.id, professionalId)))
        .limit(1);
      if (!pro) throw new BookingError("invalid_selection");
    }
    const [row] = await tx
      .insert(timeBlocks)
      .values({
        tenantId: actor.tenantId,
        professionalId,
        startsAt,
        endsAt,
        reason: input.reason?.trim().slice(0, 120) || null,
      })
      .returning({ id: timeBlocks.id });
    return { id: row.id };
  });
}

export async function deleteBlock(db: Db, actor: PanelActor, blockId: string): Promise<void> {
  if (!UUID.test(blockId)) throw blockNotFound();
  const own = await staffProfessionalId(db, actor);
  await withTenant(db, actor.tenantId, async (tx) => {
    const [row] = await tx
      .select({ id: timeBlocks.id, professionalId: timeBlocks.professionalId })
      .from(timeBlocks)
      .where(and(eq(timeBlocks.tenantId, actor.tenantId), eq(timeBlocks.id, blockId)))
      .limit(1);
    if (!row || (own !== null && row.professionalId !== own)) throw blockNotFound();
    await tx
      .delete(timeBlocks)
      .where(and(eq(timeBlocks.tenantId, actor.tenantId), eq(timeBlocks.id, blockId)));
  });
}

/**
 * Lembrete pelo WhatsApp. O token de gestão não é guardado em texto (só o
 * hash), então cada lembrete gera um token NOVO: o link anterior deixa de
 * valer. Só para agendamentos ativos (agendado ou confirmado).
 */
export async function issueManageLink(
  db: Db,
  actor: PanelActor,
  bookingId: string,
  now: Date = new Date(),
): Promise<{ whatsappUrl: string }> {
  const booking = await loadOwned(db, actor, bookingId);
  if (booking.status !== "scheduled" && booking.status !== "confirmed") {
    throw new BookingError("invalid_transition");
  }
  const token = randomBytes(32).toString("base64url");
  await withTenant(db, actor.tenantId, (tx) =>
    tx
      .update(bookings)
      .set({ manageTokenHash: hashToken(token), updatedAt: now })
      .where(and(eq(bookings.tenantId, actor.tenantId), eq(bookings.id, bookingId))),
  );
  const { phone, booking: data } = await notificationData(db, actor.tenantId, bookingId);
  const link = `${appUrl()}/agendamento/${token}`;
  return { whatsappUrl: buildWhatsAppLink(phone, reminderText({ ...data, link })) };
}

// --- Horários livres para "Novo agendamento" e "Remarcar" -------------------

export type PanelSlotsInput = {
  date: string;
  /** Novo agendamento: serviços escolhidos. */
  serviceIds?: string[];
  professionalId?: string | "any";
  /** Remarcar: mantém duração e profissional do agendamento. */
  bookingId?: string;
};

const PANEL_DAYS = 60;

/**
 * Contexto de disponibilidade do painel: a equipe ignora antecedência mínima e
 * prazo máximo (mantém expediente, conflitos e bloqueios; "encaixar fora do
 * horário" cobre o resto).
 */
async function panelContext(
  db: Db,
  actor: PanelActor,
  input: PanelSlotsInput,
  date: string,
  now: Date,
  spanDays: number,
) {
  let professionalId: string | undefined;
  let override: { durationMin: number; bufferAfterMin: number } | undefined;
  let excludeBookingId: string | undefined;
  let serviceIds = input.serviceIds ?? [];

  if (input.bookingId) {
    const booking = await loadOwned(db, actor, input.bookingId);
    professionalId = booking.professionalId;
    excludeBookingId = booking.id;
    override = {
      durationMin: (booking.endsAt.getTime() - booking.startsAt.getTime()) / 60_000,
      bufferAfterMin: (booking.blockedUntil.getTime() - booking.endsAt.getTime()) / 60_000,
    };
    serviceIds = [];
  } else {
    if (serviceIds.length === 0 || serviceIds.some((id) => !UUID.test(id))) {
      throw new BookingError("invalid_selection");
    }
    professionalId = await scopedProfessionalId(
      db,
      actor,
      input.professionalId && input.professionalId !== "any" ? input.professionalId : undefined,
    );
  }

  const ctx = await withTenant(db, actor.tenantId, (tx) =>
    loadAvailabilityContext(tx, actor.tenantId, {
      date,
      serviceIds,
      professionalId,
      now,
      spanDays,
      excludeBookingId,
      override,
    }),
  );
  return { ...ctx, rules: { ...ctx.rules, ...PANEL_RULES } };
}

export async function listPanelSlots(
  db: Db,
  actor: PanelActor,
  input: PanelSlotsInput,
  now: Date = new Date(),
): Promise<Array<{ startsAt: string; time: string }>> {
  const ctx = await panelContext(db, actor, input, input.date, now, 1);
  if (ctx.professionals.length === 0) return [];
  return getAvailableSlots(ctx).map((slot) => ({
    startsAt: slot.startsAt.toISOString(),
    time: formatTime(slot.startsAt, ctx.timezone),
  }));
}

export async function listPanelDates(
  db: Db,
  actor: PanelActor,
  input: Omit<PanelSlotsInput, "date"> & { from: string },
  now: Date = new Date(),
): Promise<string[]> {
  // Dias passados não têm horários (início antes de agora), então não é preciso recortar `from`.
  const ctx = await panelContext(db, actor, { ...input, date: input.from }, input.from, now, PANEL_DAYS);
  if (ctx.professionals.length === 0) return [];
  return getAvailableDates(ctx, input.from, PANEL_DAYS);
}
