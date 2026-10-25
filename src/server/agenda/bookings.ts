import { randomBytes } from "node:crypto";
import { and, asc, eq, inArray } from "drizzle-orm";
import {
  bookingServices,
  bookings,
  professionalServices,
  services,
  tenants,
} from "@/db/schema";
import type { Db } from "@/db/types";
import { hashToken } from "@/server/auth/session";
import { isExclusionViolation } from "@/server/db-errors";
import { withTenant } from "@/server/tenant-db";
import { getAvailableSlots, pickProfessional, type AvailabilityInput } from "./availability";
import { upsertCustomer, type CustomerInput } from "./customers";
import { BookingError } from "./errors";
import { loadAvailabilityContext } from "./load";
import { localDateOf } from "./time";

export { BookingError, SLOT_TAKEN_MESSAGE } from "./errors";
export type { BookingErrorCode } from "./errors";

const MIN_MS = 60_000;

export type BookingActor = "staff" | "customer";
export type BookingStatus = "scheduled" | "confirmed" | "completed" | "no_show" | "canceled";

export type CreateBookingInput = {
  serviceIds: string[];
  professionalId: string | "any";
  startsAt: Date;
  customer: CustomerInput;
  source: "public" | "panel";
  notes?: string;
  createdByUserId?: string;
  /** Só painel: ignora expediente, antecedência e prazo máximo (mantém conflitos e bloqueios). */
  allowOutsideHours?: boolean;
};

const TRANSITIONS: Record<BookingStatus, BookingStatus[]> = {
  scheduled: ["confirmed", "completed", "no_show", "canceled"],
  confirmed: ["scheduled", "completed", "no_show", "canceled"],
  completed: ["scheduled"],
  no_show: ["scheduled"],
  canceled: [],
};

function overlaps(aS: number, aE: number, bS: number, bE: number): boolean {
  return aS < bE && bS < aE;
}

/**
 * Profissionais do contexto livres no intervalo [start, blockedUntil), sem olhar
 * expediente (usado com `allowOutsideHours`). Mantém a ordem do contexto.
 */
function freeProfessionals(ctx: AvailabilityInput, start: number, blockedUntil: number): string[] {
  return ctx.professionals
    .filter(
      (p) =>
        !ctx.busy.some(
          (b) =>
            b.professionalId === p.id &&
            overlaps(start, blockedUntil, b.startsAt.getTime(), b.blockedUntil.getTime()),
        ) &&
        !ctx.blocks.some(
          (b) =>
            (b.professionalId === null || b.professionalId === p.id) &&
            overlaps(start, blockedUntil, b.startsAt.getTime(), b.endsAt.getTime()),
        ),
    )
    .map((p) => p.id);
}

/** Candidatos livres para `startsAt` (respeitando ou não o expediente). */
function candidatesFor(ctx: AvailabilityInput, startsAt: Date, outsideHours: boolean) {
  const start = startsAt.getTime();
  const end = start + ctx.durationMin * MIN_MS;
  const blockedUntil = end + ctx.bufferAfterMin * MIN_MS;
  const professionalIds = outsideHours
    ? freeProfessionals(ctx, start, blockedUntil)
    : (getAvailableSlots(ctx).find((s) => s.startsAt.getTime() === start)?.professionalIds ?? []);
  return { professionalIds, endsAt: new Date(end), blockedUntil: new Date(blockedUntil) };
}

/** Carga do dia por profissional: agendamentos não cancelados que começam na data local. */
function dailyLoad(ctx: AvailabilityInput): Record<string, number> {
  const load: Record<string, number> = {};
  for (const b of ctx.busy) {
    if (localDateOf(b.startsAt, ctx.timezone) === ctx.date) {
      load[b.professionalId] = (load[b.professionalId] ?? 0) + 1;
    }
  }
  return load;
}

function newManageToken() {
  const token = randomBytes(32).toString("base64url");
  return { token, hash: hashToken(token) };
}

export async function createBooking(
  db: Db,
  tenantId: string,
  input: CreateBookingInput,
  now: Date = new Date(),
): Promise<{ bookingId: string; manageToken: string }> {
  const serviceIds = [...new Set(input.serviceIds)];
  if (serviceIds.length === 0) throw new BookingError("invalid_selection");

  try {
    return await withTenant(db, tenantId, async (tx) => {
      const rows = await tx
        .select()
        .from(services)
        .where(and(eq(services.tenantId, tenantId), inArray(services.id, serviceIds)));
      const usable = rows.filter(
        (s) => s.archivedAt === null && (input.source === "panel" || s.visible),
      );
      // Serviços de outro tenant não aparecem (RLS), então a contagem não fecha.
      if (usable.length !== serviceIds.length) throw new BookingError("invalid_selection");
      // Mantém a ordem pedida pelo cliente.
      const ordered = serviceIds.map((id) => usable.find((s) => s.id === id)!);

      const date = localDateOf(input.startsAt, (await tenantTimezone(tx, tenantId)));
      const ctx = await loadAvailabilityContext(tx, tenantId, {
        date,
        serviceIds,
        professionalId: input.professionalId === "any" ? undefined : input.professionalId,
        now,
      });
      // Nenhum profissional ativo que faça todos os serviços (ou o escolhido não faz).
      if (ctx.professionals.length === 0) throw new BookingError("invalid_selection");

      const { professionalIds, endsAt, blockedUntil } = candidatesFor(
        ctx,
        input.startsAt,
        input.source === "panel" && input.allowOutsideHours === true,
      );
      if (professionalIds.length === 0) throw new BookingError("slot_taken");

      const professionalId =
        input.professionalId === "any"
          ? pickProfessional(
              {
                startsAt: input.startsAt,
                endsAt,
                blockedUntil,
                professionalIds,
              },
              dailyLoad(ctx),
            )
          : professionalIds[0];

      const customer = await upsertCustomer(tx, tenantId, input.customer, input.source);
      const { token, hash } = newManageToken();

      const [booking] = await tx
        .insert(bookings)
        .values({
          tenantId,
          professionalId,
          customerId: customer.id,
          startsAt: input.startsAt,
          endsAt,
          blockedUntil,
          source: input.source,
          totalCents: ordered.reduce((s, r) => s + r.priceCents, 0),
          manageTokenHash: hash,
          notes: input.notes,
          createdByUserId: input.createdByUserId,
        })
        .returning({ id: bookings.id });

      await tx.insert(bookingServices).values(
        ordered.map((s, position) => ({
          tenantId,
          bookingId: booking.id,
          serviceId: s.id,
          name: s.name,
          durationMin: s.durationMin,
          priceCents: s.priceCents,
          position,
        })),
      );

      return { bookingId: booking.id, manageToken: token };
    });
  } catch (error) {
    // Corrida: outra transação reservou entre a checagem e o INSERT.
    if (isExclusionViolation(error)) throw new BookingError("slot_taken");
    throw error;
  }
}

async function tenantTimezone(tx: Db, tenantId: string): Promise<string> {
  const [t] = await tx
    .select({ timezone: tenants.timezone })
    .from(tenants)
    .where(eq(tenants.id, tenantId))
    .limit(1);
  if (!t) throw new Error("Estabelecimento não encontrado");
  return t.timezone;
}

async function getBookingOrThrow(tx: Db, tenantId: string, bookingId: string) {
  const [booking] = await tx
    .select()
    .from(bookings)
    .where(and(eq(bookings.tenantId, tenantId), eq(bookings.id, bookingId)))
    .limit(1)
    // Trava a linha: quem chega depois relê o estado já gravado.
    .for("update");
  if (!booking) throw new BookingError("not_found");
  return booking;
}

async function assertCustomerWindow(
  tx: Db,
  tenantId: string,
  actor: BookingActor,
  startsAt: Date,
  now: Date,
) {
  if (actor !== "customer") return;
  const [t] = await tx
    .select({ cancelWindowMin: tenants.cancelWindowMin })
    .from(tenants)
    .where(eq(tenants.id, tenantId))
    .limit(1);
  if (!t) throw new Error("Estabelecimento não encontrado");
  if (startsAt.getTime() - now.getTime() < t.cancelWindowMin * MIN_MS) {
    throw new BookingError("outside_window");
  }
}

/**
 * Remarca mantendo os serviços (duração e buffer vêm do próprio agendamento) e,
 * por padrão, o profissional. Cliente: mesmas regras de expediente/antecedência
 * da reserva online e prazo `cancelWindowMin`. Equipe: ignora expediente e
 * antecedência (como o painel), mas nunca conflitos nem bloqueios.
 */
export async function rescheduleBooking(
  db: Db,
  tenantId: string,
  bookingId: string,
  newStartsAt: Date,
  actor: BookingActor,
  now: Date = new Date(),
  professionalId?: string,
): Promise<void> {
  try {
    await withTenant(db, tenantId, async (tx) => {
      const booking = await getBookingOrThrow(tx, tenantId, bookingId);
      if (booking.status !== "scheduled" && booking.status !== "confirmed") {
        throw new BookingError("invalid_transition");
      }
      await assertCustomerWindow(tx, tenantId, actor, booking.startsAt, now);

      const targetPro = professionalId ?? booking.professionalId;
      if (targetPro !== booking.professionalId) {
        const lines = await tx
          .select({ serviceId: bookingServices.serviceId })
          .from(bookingServices)
          .where(and(eq(bookingServices.tenantId, tenantId), eq(bookingServices.bookingId, bookingId)));
        const ids = lines.map((l) => l.serviceId).filter((id): id is string => id !== null);
        if (ids.length > 0) {
          const links = await tx
            .select({ serviceId: professionalServices.serviceId })
            .from(professionalServices)
            .where(
              and(
                eq(professionalServices.tenantId, tenantId),
                eq(professionalServices.professionalId, targetPro),
                inArray(professionalServices.serviceId, ids),
              ),
            );
          if (new Set(links.map((l) => l.serviceId)).size !== new Set(ids).size) {
            throw new BookingError("invalid_selection");
          }
        }
      }

      const durationMin = (booking.endsAt.getTime() - booking.startsAt.getTime()) / MIN_MS;
      const bufferAfterMin = (booking.blockedUntil.getTime() - booking.endsAt.getTime()) / MIN_MS;
      const ctx = await loadAvailabilityContext(tx, tenantId, {
        date: localDateOf(newStartsAt, await tenantTimezone(tx, tenantId)),
        serviceIds: [],
        professionalId: targetPro,
        now,
        excludeBookingId: bookingId,
        override: { durationMin, bufferAfterMin },
      });
      if (ctx.professionals.length === 0) throw new BookingError("invalid_selection");

      const { professionalIds, endsAt, blockedUntil } = candidatesFor(
        ctx,
        newStartsAt,
        actor === "staff",
      );
      if (!professionalIds.includes(targetPro)) throw new BookingError("slot_taken");

      await tx
        .update(bookings)
        .set({
          professionalId: targetPro,
          startsAt: newStartsAt,
          endsAt,
          blockedUntil,
          updatedAt: now,
        })
        .where(and(eq(bookings.tenantId, tenantId), eq(bookings.id, bookingId)));
    });
  } catch (error) {
    if (isExclusionViolation(error)) throw new BookingError("slot_taken");
    throw error;
  }
}

export async function cancelBooking(
  db: Db,
  tenantId: string,
  bookingId: string,
  actor: BookingActor,
  now: Date = new Date(),
): Promise<void> {
  await withTenant(db, tenantId, async (tx) => {
    const booking = await getBookingOrThrow(tx, tenantId, bookingId);
    if (!TRANSITIONS[booking.status].includes("canceled")) {
      throw new BookingError("invalid_transition");
    }
    await assertCustomerWindow(tx, tenantId, actor, booking.startsAt, now);
    await tx
      .update(bookings)
      .set({ status: "canceled", canceledAt: now, canceledBy: actor, updatedAt: now })
      .where(and(eq(bookings.tenantId, tenantId), eq(bookings.id, bookingId)));
  });
}

export async function setBookingStatus(
  db: Db,
  tenantId: string,
  bookingId: string,
  status: Exclude<BookingStatus, "canceled">,
): Promise<void> {
  try {
    await withTenant(db, tenantId, async (tx) => {
      const booking = await getBookingOrThrow(tx, tenantId, bookingId);
      if (!TRANSITIONS[booking.status].includes(status)) {
        throw new BookingError("invalid_transition");
      }
      await tx
        .update(bookings)
        .set({ status, updatedAt: new Date() })
        .where(and(eq(bookings.tenantId, tenantId), eq(bookings.id, bookingId)));
    });
  } catch (error) {
    // Desfazer concluído/falta reativa o horário, que pode ter sido ocupado.
    if (isExclusionViolation(error)) throw new BookingError("slot_taken");
    throw error;
  }
}

/**
 * Localiza um agendamento pelo token do link de gestão. Roda FORA de
 * `withTenant`, com o papel dono da conexão: o tenant ainda não é conhecido
 * (vem do próprio agendamento), então a consulta precisa enxergar todos os
 * tenants. Por isso devolve somente `{ tenantId, bookingId }` e filtra pelo
 * hash SHA-256 (único); todo o resto deve seguir via `withTenant`.
 */
export async function findBookingByManageToken(
  db: Db,
  token: string,
): Promise<{ tenantId: string; bookingId: string } | null> {
  if (!token) return null;
  const [row] = await db
    .select({ tenantId: bookings.tenantId, bookingId: bookings.id })
    .from(bookings)
    .where(eq(bookings.manageTokenHash, hashToken(token)))
    .orderBy(asc(bookings.id))
    .limit(1);
  return row ?? null;
}
