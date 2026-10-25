import { eq } from "drizzle-orm";
import { tenants } from "@/db/schema";
import type { Db } from "@/db/types";
import { ensureReadableBrandColor } from "@/lib/color";
import {
  bookingRulesSchema,
  brandingSchema,
  businessInfoSchema,
  fieldErrorsOf,
  type BookingRulesInput,
  type BusinessInfoInput,
} from "./schemas";
import { validationError } from "./errors";

/*
 * `tenants` não tem RLS e o papel `agenda_app` só lê nela: estas gravações
 * usam a conexão do dono (`db`) filtrando sempre por `tenants.id`, com o
 * `tenantId` vindo da sessão. Nunca dentro de `withTenant`.
 */

export async function updateBusinessInfo(
  db: Db,
  tenantId: string,
  input: BusinessInfoInput,
): Promise<void> {
  const parsed = businessInfoSchema.safeParse(input);
  if (!parsed.success) throw validationError(fieldErrorsOf(parsed.error));
  await db.update(tenants).set(parsed.data).where(eq(tenants.id, tenantId));
}

/** Guarda a cor já ajustada: quem lê (página pública) pode usá-la como está. */
export async function updateBranding(
  db: Db,
  tenantId: string,
  input: { color: string },
): Promise<{ color: string; adjusted: boolean }> {
  const parsed = brandingSchema.safeParse(input);
  if (!parsed.success) throw validationError(fieldErrorsOf(parsed.error));
  const result = ensureReadableBrandColor(parsed.data.color);
  await db
    .update(tenants)
    .set({ brandColor: result.color })
    .where(eq(tenants.id, tenantId));
  return result;
}

export async function updateBookingRules(
  db: Db,
  tenantId: string,
  input: BookingRulesInput,
): Promise<void> {
  const parsed = bookingRulesSchema.safeParse(input);
  if (!parsed.success) throw validationError(fieldErrorsOf(parsed.error));
  await db.update(tenants).set(parsed.data).where(eq(tenants.id, tenantId));
}
