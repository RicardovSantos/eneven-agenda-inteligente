/** Soma um mês em UTC mantendo o dia (ou o último dia do mês seguinte, se ele não existir). */
export function addOneMonthUtc(date: Date): Date {
  const result = new Date(date.getTime());
  const day = result.getUTCDate();
  result.setUTCDate(1);
  result.setUTCMonth(result.getUTCMonth() + 1);
  const lastDay = new Date(Date.UTC(result.getUTCFullYear(), result.getUTCMonth() + 1, 0)).getUTCDate();
  result.setUTCDate(Math.min(day, lastDay));
  return result;
}

/**
 * Até quando o período já pago dá acesso: um mês depois do vencimento da última
 * fatura aprovada (ou do pagamento, se o vencimento não veio). `null` se nada foi pago.
 */
export function paidThrough(invoices: Array<{ providerStatus: string; dueAt: Date | null; paidAt: Date | null }>): Date | null {
  let latest: Date | null = null;
  for (const invoice of invoices) {
    if (invoice.providerStatus !== "approved") continue;
    const base = invoice.dueAt ?? invoice.paidAt;
    if (!base || !Number.isFinite(base.getTime())) continue;
    if (!latest || base.getTime() > latest.getTime()) latest = base;
  }
  return latest ? addOneMonthUtc(latest) : null;
}
