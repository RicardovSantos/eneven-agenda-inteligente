"use client";

import { formatTime } from "@/lib/dates";

/**
 * Linha do "agora" (fio do tempo): ponto na ponta esquerda, degradê da marca e
 * a hora. Só aparece no dia de hoje; quem a usa renova `nowMs` a cada minuto.
 */
export function NowLine({ nowMs, timezone }: { nowMs: number; timezone: string }) {
  const time = formatTime(new Date(nowMs), timezone);
  return (
    <li aria-label={`Agora, ${time}`} className="flex items-center py-0.5 lg:py-1" data-testid="now-line">
      <span aria-hidden="true" className="size-2.5 flex-none rounded-full bg-primary" />
      <span
        aria-hidden="true"
        className="h-[3px] flex-1 rounded-full bg-[linear-gradient(90deg,#3e07d2,#9429f7,#f581fb)]"
      />
      <span className="ml-2 font-semibold tabular-nums text-primary text-xs">{time}</span>
    </li>
  );
}
