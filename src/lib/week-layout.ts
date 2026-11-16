/** Regras puras da visão "Semana" da agenda (sem React, para testar). */
import { addDaysToDate, weekdayOf } from "@/server/agenda/time";

/** Domingo a sábado da semana que contém `date` ("yyyy-MM-dd"). */
export function weekDates(date: string): string[] {
  const start = addDaysToDate(date, -weekdayOf(date));
  return Array.from({ length: 7 }, (_, i) => addDaysToDate(start, i));
}

export type LaneInput = { id: string; start: number; end: number };
export type Lane = { lane: number; lanes: number };

/**
 * Coloca agendamentos que se sobrepõem lado a lado: cada grupo de itens ligados
 * por sobreposição divide a largura em tantas faixas quanto o máximo de itens
 * simultâneos do grupo. Devolve a faixa (0, 1, …) e o total de faixas de cada item.
 */
export function assignLanes(items: LaneInput[]): Map<string, Lane> {
  const sorted = [...items].sort((a, b) => a.start - b.start || a.end - b.end);
  const result = new Map<string, Lane>();
  let cluster: Array<{ id: string; lane: number }> = [];
  let laneEnds: number[] = [];
  let clusterEnd = -Infinity;

  const flush = () => {
    for (const item of cluster) result.set(item.id, { lane: item.lane, lanes: laneEnds.length });
    cluster = [];
    laneEnds = [];
  };

  for (const item of sorted) {
    if (item.start >= clusterEnd) {
      flush();
      clusterEnd = -Infinity;
    }
    let lane = laneEnds.findIndex((end) => end <= item.start);
    if (lane === -1) {
      lane = laneEnds.length;
      laneEnds.push(item.end);
    } else {
      laneEnds[lane] = item.end;
    }
    cluster.push({ id: item.id, lane });
    clusterEnd = Math.max(clusterEnd, item.end);
  }
  flush();
  return result;
}

/**
 * Faixa de horas da grade: do menor ao maior horário (de funcionamento da semana ou de
 * qualquer item fora dele), arredondada para a hora cheia; padrão 08:00–19:00.
 */
export function gridRange(
  open: { startMin: number; endMin: number } | null,
  itemRanges: Array<{ start: number; end: number }>,
): { startMin: number; endMin: number } {
  let start = open?.startMin ?? 8 * 60;
  let end = open?.endMin ?? 19 * 60;
  for (const r of itemRanges) {
    start = Math.min(start, r.start);
    end = Math.max(end, r.end);
  }
  return {
    startMin: Math.floor(start / 60) * 60,
    endMin: Math.min(1440, Math.ceil(end / 60) * 60),
  };
}
