/** Formatação pt-BR compartilhada (valores em centavos, durações em minutos). */

const BRL = new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" });

/** 12345 -> "R$ 1.234,50" (espaço comum, para casar com os mockups). */
export function formatBRL(cents: number): string {
  return BRL.format(cents / 100).replace(/\s/g, " ");
}

/** 30 -> "30 min"; 75 -> "1 h 15 min"; 120 -> "2 h". */
export function formatDuration(minutes: number): string {
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  if (h === 0) return `${m} min`;
  return m === 0 ? `${h} h` : `${h} h ${m} min`;
}

/**
 * Máscara de preço: só os dígitos viram centavos ("9" -> 9 centavos,
 * "9000" -> R$ 90,00). Devolve o valor em centavos.
 */
export function centsFromDigits(raw: string, max = 99_999_999): number {
  const digits = raw.replace(/\D/g, "").replace(/^0+/, "");
  if (digits === "") return 0;
  return Math.min(Number(digits.slice(0, 9)), max);
}
