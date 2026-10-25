import { eq, sql } from "drizzle-orm";
import { tenants } from "@/db/schema";
import type { Db } from "@/db/types";
import { isUniqueViolation } from "@/server/db-errors";
import { RESERVED_SLUGS, slugify } from "@/server/tenants/slug";
import { validationError } from "./errors";

export const SLUG_TAKEN_MESSAGE = "Esse link já está em uso.";
export const SLUG_RESERVED_MESSAGE = "Esse link não está disponível. Escolha outro.";
export const SLUG_EMPTY_MESSAGE = "Informe o link da sua agenda.";

export type SlugAvailability =
  | { status: "invalid" }
  | { status: "current" | "available" | "taken" | "reserved"; slug: string };

export async function checkSlugAvailability(
  db: Db,
  tenantId: string,
  raw: string,
): Promise<SlugAvailability> {
  if (raw.trim() === "") return { status: "invalid" };
  const slug = slugify(raw);
  if (RESERVED_SLUGS.includes(slug)) return { status: "reserved", slug };
  const [row] = await db
    .select({ id: tenants.id })
    .from(tenants)
    .where(eq(tenants.slug, slug))
    .limit(1);
  if (!row) return { status: "available", slug };
  return { status: row.id === tenantId ? "current" : "taken", slug };
}

/**
 * Troca o link público. Um único slug vale por vez: o antigo deixa de
 * funcionar. A unicidade final é da constraint `tenants_slug_unique`.
 */
export async function updateSlug(
  db: Db,
  tenantId: string,
  raw: string,
): Promise<{ slug: string }> {
  const check = await checkSlugAvailability(db, tenantId, raw);
  if (check.status === "invalid") throw validationError({ slug: SLUG_EMPTY_MESSAGE });
  if (check.status === "reserved") throw validationError({ slug: SLUG_RESERVED_MESSAGE });
  if (check.status === "taken") throw validationError({ slug: SLUG_TAKEN_MESSAGE });
  if (check.status === "current") return { slug: check.slug };

  const path = `/api/logo/${check.slug}`;
  try {
    await db
      .update(tenants)
      .set({
        slug: check.slug,
        // Mantém a versão do logo; só troca o caminho.
        logoUrl: sql`case when ${tenants.logoUrl} is null then null else ${path}::text || '?v=' || split_part(${tenants.logoUrl}, '?v=', 2) end`,
      })
      .where(eq(tenants.id, tenantId));
  } catch (error) {
    if (isUniqueViolation(error, "tenants_slug_unique")) {
      throw validationError({ slug: SLUG_TAKEN_MESSAGE });
    }
    throw error;
  }
  return { slug: check.slug };
}
