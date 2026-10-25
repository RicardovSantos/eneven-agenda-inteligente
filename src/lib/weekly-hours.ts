/**
 * Horários semanais: validação compartilhada entre servidor e cliente (o
 * editor mostra os mesmos erros que o servidor aplicaria). Sem imports de
 * servidor.
 */
import type { TimeRange, WeeklyHours } from "@/server/agenda/availability";

export type { TimeRange, WeeklyHours };

export const WEEKDAYS = [0, 1, 2, 3, 4, 5, 6] as const;
/** Ordem de exibição: segunda a domingo. */
export const WEEKDAY_ORDER = [1, 2, 3, 4, 5, 6, 0] as const;
export const WEEKDAY_LABELS: Record<number, string> = {
  0: "Domingo",
  1: "Segunda",
  2: "Terça",
  3: "Quarta",
  4: "Quinta",
  5: "Sexta",
  6: "Sábado",
};
export const MAX_RANGES_PER_DAY = 4;

const HM = /^([01]\d|2[0-3]):([0-5]\d)$/;

const minutes = (value: string): number | null => {
  const m = HM.exec(value);
  return m ? Number(m[1]) * 60 + Number(m[2]) : null;
};

export function emptyWeek(): WeeklyHours {
  return { 0: [], 1: [], 2: [], 3: [], 4: [], 5: [], 6: [] };
}

/**
 * Devolve a primeira mensagem de erro de cada dia (chave = dia da semana), ou
 * `{}` quando válido: formato HH:MM, início antes do fim e sem sobreposição
 * (intervalos que só se encostam são aceitos).
 */
export function validateWeeklyHours(
  hours: WeeklyHours,
): Partial<Record<number, string>> {
  const errors: Partial<Record<number, string>> = {};
  for (const day of WEEKDAYS) {
    const ranges = hours[day];
    if (!Array.isArray(ranges)) {
      errors[day] = "Horário inválido.";
      continue;
    }
    if (ranges.length > MAX_RANGES_PER_DAY) {
      errors[day] = `Use no máximo ${MAX_RANGES_PER_DAY} intervalos por dia.`;
      continue;
    }
    const parsed: Array<[number, number]> = [];
    let message: string | undefined;
    for (const range of ranges) {
      const start = minutes(range?.start ?? "");
      const end = minutes(range?.end ?? "");
      if (start === null || end === null) {
        message = "Informe horários válidos.";
        break;
      }
      if (start >= end) {
        message = "O início precisa ser antes do fim.";
        break;
      }
      parsed.push([start, end]);
    }
    if (!message) {
      parsed.sort((a, b) => a[0] - b[0]);
      for (let i = 1; i < parsed.length; i++) {
        if (parsed[i][0] < parsed[i - 1][1]) {
          message = "Os intervalos não podem se sobrepor.";
          break;
        }
      }
    }
    if (message) errors[day] = message;
  }
  return errors;
}

/** "Seg a Sex 9h–18h" não é necessário aqui; só o formato para exibir um intervalo. */
export function formatRange(range: TimeRange): string {
  return `${range.start}–${range.end}`;
}
