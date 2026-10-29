import { and, eq, ne } from "drizzle-orm";
import { z } from "zod";
import { bookings, customers } from "@/db/schema";
import type { Db } from "@/db/types";
import { normalizeBrazilPhone } from "@/lib/phone";
import { staffProfessionalId, type PanelActor } from "@/server/agenda/panel-ops";
import { isUniqueViolation } from "@/server/db-errors";
import { withTenant } from "@/server/tenant-db";
import { ClientError } from "./errors";

export type ClientInput = { name: string; phone: string; email?: string | null; notes?: string | null };

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const PHONE_CONSTRAINT = "customers_tenant_phone_unique";

const notesSchema = z.string().trim().max(500, "As observações podem ter até 500 caracteres.");

const clientSchema = z.object({
  name: z.string().trim().min(1, "Informe o nome.").max(80, "O nome pode ter até 80 caracteres."),
  phone: z
    .string()
    .transform((v) => normalizeBrazilPhone(v))
    .refine((v): v is string => v !== null, "Informe um WhatsApp válido com DDD."),
  email: z
    .string()
    .trim()
    .optional()
    .nullable()
    .refine((v) => !v || z.email().safeParse(v).success, "Informe um e-mail válido ou deixe em branco."),
  notes: notesSchema.optional().nullable(),
});

function validate<T>(schema: z.ZodType<T>, input: unknown): T {
  const parsed = schema.safeParse(input);
  if (parsed.success) return parsed.data;
  const fieldErrors: Record<string, string> = {};
  for (const issue of parsed.error.issues) {
    const key = String(issue.path[0] ?? "form");
    fieldErrors[key] ??= issue.message;
  }
  throw new ClientError("validation", undefined, { fieldErrors });
}

function parseClient(input: ClientInput) {
  const data = validate(clientSchema, input);
  return {
    name: data.name,
    phone: data.phone as string,
    email: data.email?.trim() || null,
    notes: data.notes?.trim() || null,
  };
}

function assertCanEdit(actor: PanelActor) {
  if (actor.role === "staff") throw new ClientError("forbidden");
}

async function findByPhone(db: Db, tenantId: string, phone: string, exceptId?: string) {
  const [row] = await withTenant(db, tenantId, (tx) =>
    tx
      .select({ id: customers.id })
      .from(customers)
      .where(
        and(
          eq(customers.tenantId, tenantId),
          eq(customers.phone, phone),
          exceptId ? ne(customers.id, exceptId) : undefined,
        ),
      )
      .limit(1),
  );
  return row?.id;
}

/** `phone_taken` por pré-checagem; a unique do banco cobre a corrida entre duas gravações. */
async function writeWithPhoneGuard<T>(
  db: Db,
  tenantId: string,
  phone: string,
  exceptId: string | undefined,
  write: () => Promise<T>,
): Promise<T> {
  const taken = (existingId: string | undefined) =>
    new ClientError("phone_taken", undefined, { existingId });
  const before = await findByPhone(db, tenantId, phone, exceptId);
  if (before) throw taken(before);
  try {
    return await write();
  } catch (error) {
    // A transação com a violação já foi desfeita; a releitura roda em outra.
    if (isUniqueViolation(error, PHONE_CONSTRAINT)) {
      throw taken(await findByPhone(db, tenantId, phone, exceptId));
    }
    throw error;
  }
}

export async function createClient(db: Db, actor: PanelActor, input: ClientInput): Promise<{ id: string }> {
  assertCanEdit(actor);
  const data = parseClient(input);
  return writeWithPhoneGuard(db, actor.tenantId, data.phone, undefined, () =>
    withTenant(db, actor.tenantId, async (tx) => {
      const [row] = await tx
        .insert(customers)
        .values({ tenantId: actor.tenantId, ...data })
        .returning({ id: customers.id });
      return { id: row.id };
    }),
  );
}

export async function updateClient(db: Db, actor: PanelActor, id: string, input: ClientInput): Promise<void> {
  assertCanEdit(actor);
  const data = parseClient(input);
  if (!UUID.test(id)) throw new ClientError("not_found");
  await writeWithPhoneGuard(db, actor.tenantId, data.phone, id, () =>
    withTenant(db, actor.tenantId, async (tx) => {
      const updated = await tx
        .update(customers)
        .set(data)
        .where(and(eq(customers.tenantId, actor.tenantId), eq(customers.id, id)))
        .returning({ id: customers.id });
      if (updated.length === 0) throw new ClientError("not_found");
    }),
  );
}

/** Observações: todos os papéis, `staff` só de cliente que já atendeu. */
export async function updateClientNotes(db: Db, actor: PanelActor, id: string, notes: string): Promise<void> {
  const value = validate(z.object({ notes: notesSchema }), { notes }).notes || null;
  if (!UUID.test(id)) throw new ClientError("not_found");
  const own = await staffProfessionalId(db, actor);
  await withTenant(db, actor.tenantId, async (tx) => {
    if (own !== null) {
      const [served] = await tx
        .select({ id: bookings.id })
        .from(bookings)
        .where(
          and(
            eq(bookings.tenantId, actor.tenantId),
            eq(bookings.customerId, id),
            eq(bookings.professionalId, own),
          ),
        )
        .limit(1);
      if (!served) throw new ClientError("not_found");
    }
    const updated = await tx
      .update(customers)
      .set({ notes: value })
      .where(and(eq(customers.tenantId, actor.tenantId), eq(customers.id, id)))
      .returning({ id: customers.id });
    if (updated.length === 0) throw new ClientError("not_found");
  });
}
