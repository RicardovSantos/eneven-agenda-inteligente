/** Agrupamento, filtro e busca da lista de serviços do painel (sem React, para testar). */

export const OTHER_CATEGORY = "Outros serviços";

type Groupable = { name: string; categoryName: string | null };

export type ServiceGroup<T> = {
  /** `null` = serviços sem categoria ("Outros serviços"). */
  category: string | null;
  items: T[];
};

/** Minúsculas e sem acento, letra por letra: o tamanho do texto não muda (serve para destacar). */
export function fold(text: string): string {
  let out = "";
  for (const ch of text) {
    const base = ch.normalize("NFD")[0] ?? ch;
    out += base.toLocaleLowerCase("pt-BR");
  }
  return out;
}

/** Trecho do nome que combina com a busca (ignora acento e maiúscula), ou `null`. */
export function matchRange(
  name: string,
  query: string,
): [number, number] | null {
  const needle = fold(query.trim());
  if (needle === "") return null;
  const start = fold(name).indexOf(needle);
  return start < 0 ? null : [start, start + needle.length];
}

/**
 * Agrupa por categoria, na ordem em que aparecem; "Outros serviços" sempre por último.
 * `query` filtra pelo nome ou categoria; `category` mostra só um grupo (`""` = sem categoria).
 */
export function groupServices<T extends Groupable>(
  items: T[],
  options: { query?: string; category?: string | null } = {},
): ServiceGroup<T>[] {
  const needle = fold((options.query ?? "").trim());
  const wanted = options.category ?? null;
  const order: Array<string | null> = [];
  const byCategory = new Map<string | null, T[]>();
  for (const item of items) {
    const category = item.categoryName?.trim() ? item.categoryName : null;
    if (
      wanted !== null &&
      (wanted === "" ? category !== null : category !== wanted)
    )
      continue;
    if (
      needle !== "" &&
      !fold(item.name).includes(needle) &&
      !fold(category ?? "").includes(needle)
    )
      continue;
    if (!byCategory.has(category)) {
      byCategory.set(category, []);
      order.push(category);
    }
    byCategory.get(category)!.push(item);
  }
  const named = order.filter((c): c is string => c !== null);
  const ordered: Array<string | null> = byCategory.has(null)
    ? [...named, null]
    : named;
  return ordered.map((category) => ({
    category,
    items: byCategory.get(category)!,
  }));
}

/** Categorias com a quantidade de serviços (os chips de filtro), "Outros serviços" por último. */
export function categoryCounts<T extends Groupable>(
  items: T[],
): Array<{ category: string | null; count: number }> {
  return groupServices(items).map((g) => ({
    category: g.category,
    count: g.items.length,
  }));
}

/** Os cabeçalhos só fazem sentido se há mais de um grupo ou se o grupo tem nome. */
export function showGroupHeaders<T>(groups: ServiceGroup<T>[]): boolean {
  return (
    groups.length > 1 || (groups.length === 1 && groups[0]!.category !== null)
  );
}
