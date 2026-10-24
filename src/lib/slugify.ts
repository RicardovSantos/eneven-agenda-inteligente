/**
 * Regra de slug compartilhada entre servidor e cliente (a prévia do link no
 * cadastro usa a mesma função). Não importe nada de servidor aqui.
 */

export const FALLBACK_SLUG = "estabelecimento";
export const MAX_SLUG_LENGTH = 48;

/** Corta em `max` caracteres, preferindo o último hífen (sem cortar palavra). */
export function truncateSlug(slug: string, max: number): string {
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
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/['’`´]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
  return truncateSlug(slug, MAX_SLUG_LENGTH) || FALLBACK_SLUG;
}
