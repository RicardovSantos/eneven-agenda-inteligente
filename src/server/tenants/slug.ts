import { inArray } from "drizzle-orm";
import { tenants } from "@/db/schema";
import type { Db } from "@/db/types";
import { MAX_SLUG_LENGTH, slugify, truncateSlug } from "@/lib/slugify";

// `slugify` mora em `src/lib/slugify.ts` (sem imports de servidor) para a
// prévia do cadastro usar a mesma regra no navegador. Reexportado aqui.
export { FALLBACK_SLUG, MAX_SLUG_LENGTH, slugify } from "@/lib/slugify";

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
  "convite",
  "_next",
];

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
      : `${truncateSlug(base, MAX_SLUG_LENGTH - `-${n}`.length)}-${n}`;

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
