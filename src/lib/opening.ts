/**
 * Frase de funcionamento do cabeçalho da página pública ("Aberto hoje até
 * 19h"). Funções puras: recebem os intervalos de hoje ("HH:MM") e o minuto
 * atual no fuso do salão.
 */

type Range = { start: string; end: string };

const minutes = (hm: string) => Number(hm.slice(0, 2)) * 60 + Number(hm.slice(3, 5));

/** "09:00" -> "9h"; "18:30" -> "18h30". */
function shortTime(hm: string): string {
  const [h, m] = hm.split(":");
  return m === "00" ? `${Number(h)}h` : `${Number(h)}h${m}`;
}

export function describeOpening(todayRanges: Range[], nowMinutes: number): string {
  const ranges = [...todayRanges].sort((a, b) => minutes(a.start) - minutes(b.start));
  if (ranges.length === 0) return "Fechado hoje";
  const open = ranges.find((r) => nowMinutes >= minutes(r.start) && nowMinutes < minutes(r.end));
  if (open) return `Aberto hoje até ${shortTime(open.end)}`;
  const next = ranges.find((r) => minutes(r.start) > nowMinutes);
  if (next) return `Abre hoje às ${shortTime(next.start)}`;
  return "Fechado agora";
}

/** Endereço e funcionamento na mesma linha (no máximo dois itens). */
export function publicSubtitle(address: string | null, opening: string | null): string | null {
  const parts = [address?.trim(), opening].filter((p): p is string => Boolean(p));
  return parts.length > 0 ? parts.join(" · ") : null;
}
