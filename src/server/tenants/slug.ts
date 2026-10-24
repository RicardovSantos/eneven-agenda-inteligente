import { inArray } from "drizzle-orm";
import { tenants } from "@/db/schema";
import type { Db } from "@/db/types";

export const RESERVED_SLUGS: readonly string[] = [
  "painel",
  "entrar",
  "cadastro",
  "admin",
  "api",
  "brand",
  "demo",
  "termos",
  "privacidade",
  "ajuda",
  "suporte",
  "sair",
  "confirmar-email",
  "recuperar-senha",
  "agendamento",
  "_next",
];

export const FALLBACK_SLUG = "estabelecimento";
export const MAX_SLUG_LENGTH = 48;

/** Corta em `max` caracteres, preferindo o último hífen (sem cortar palavra). */
function truncate(slug: string, max: number): string {
  if (slug.length <= max) return slug;
  const cut = slug.slice(0, max);
  if (slug[max] === "-") return cut.replace(/-+$/, "");
  const lastHyphen = cut.lastIndexOf("-");
  const result = lastHyphen > 0 ? cut.slice(0, lastHyphen) : cut;
  return result.replace(/-+$/, "");
}

export function slugify(name: string): string {
  const slug = name
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/['’`´]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
  return truncate(slug, MAX_SLUG_LENGTH) || FALLBACK_SLUG;
}

/**
 * Gera um slug livre: não reservado e ainda não usado por outro
 * estabelecimento. Em colisão acrescenta `-2`, `-3`, ...
 *
 * A unicidade final é garantida pela constraint `tenants.slug`; quem insere
 * deve tratar o raro conflito de corrida (tentar novamente).
 */
export async function generateUniqueSlug(
  db: Db,
  name: string,
): Promise<string> {
  const base = slugify(name);
  const candidate = (n: number) =>
    n === 1
      ? base
      : `${truncate(base, MAX_SLUG_LENGTH - `-${n}`.length)}-${n}`;

  const batchSize = 20;
  for (let start = 1; ; start += batchSize) {
    const candidates = Array.from({ length: batchSize }, (_, i) =>
      candidate(start + i),
    );
    const rows = await db
      .select({ slug: tenants.slug })
      .from(tenants)
      .where(inArray(tenants.slug, candidates));
    const taken = new Set(rows.map((r) => r.slug));
    const free = candidates.find(
      (slug) => !taken.has(slug) && !RESERVED_SLUGS.includes(slug),
    );
    if (free) return free;
  }
}
