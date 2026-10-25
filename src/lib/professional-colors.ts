/**
 * Paleta fixa de identificação dos profissionais (docs/design/sistema-visual.md):
 * 8 tons médios com contraste AA para texto branco.
 */
export const PROFESSIONAL_COLORS = [
  "#3E07D2",
  "#0E7C86",
  "#B4237A",
  "#2F6FDB",
  "#8A5A00",
  "#4C7A12",
  "#A23B3B",
  "#5B4BC4",
] as const;

export type ProfessionalColor = (typeof PROFESSIONAL_COLORS)[number];

export const isProfessionalColor = (value: unknown): value is ProfessionalColor =>
  typeof value === "string" &&
  (PROFESSIONAL_COLORS as readonly string[]).includes(value.toUpperCase());

/** Primeira cor da paleta ainda não usada (volta ao começo se todas estiverem). */
export function nextProfessionalColor(used: Array<string | null>): ProfessionalColor {
  const taken = new Set(used.map((c) => c?.toUpperCase()));
  return PROFESSIONAL_COLORS.find((c) => !taken.has(c)) ?? PROFESSIONAL_COLORS[0];
}
