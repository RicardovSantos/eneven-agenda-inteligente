import { formatBRL } from "@/lib/format";
import type { PlatformMetrics } from "@/server/platform/metrics";

const plural = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`;
const BR = new Intl.NumberFormat("pt-BR");

/** Os quatro números do topo da lista (`Admin.dc.html`). */
export function MetricsCards({ metrics }: { metrics: PlatformMetrics }) {
  const { conversion } = metrics;
  const cards = [
    {
      label: "Receita mensal (MRR)",
      value: formatBRL(metrics.mrrCents),
      hint: plural(metrics.activeCount, "assinatura ativa", "assinaturas ativas"),
    },
    {
      label: "Em teste",
      value: BR.format(metrics.trialCount),
      hint:
        metrics.trialEndingIn7Days === 0
          ? "Nenhum termina nesta semana"
          : `${metrics.trialEndingIn7Days} ${metrics.trialEndingIn7Days === 1 ? "termina" : "terminam"} nesta semana`,
    },
    {
      label: "Conversão do teste",
      value: conversion.rate === null ? "—" : `${Math.round(conversion.rate * 100)}%`,
      hint:
        conversion.finished === 0
          ? "Ainda sem testes encerrados"
          : `${conversion.converted} de ${conversion.finished} viraram assinatura`,
    },
    {
      label: "Agendamentos em 30 dias",
      value: BR.format(metrics.bookings30d),
      hint:
        metrics.publicShare === null
          ? "Nenhum agendamento no período"
          : `${Math.round(metrics.publicShare * 100)}% pela página pública`,
    },
  ];

  return (
    <section
      aria-label="Números da plataforma"
      className="grid grid-cols-[repeat(auto-fit,minmax(200px,1fr))] gap-4"
    >
      {cards.map((card) => (
        <div
          key={card.label}
          className="flex flex-col gap-1 rounded-panel border border-line bg-surface px-5 py-[18px]"
        >
          <span className="text-sm font-semibold text-ink-muted">{card.label}</span>
          <span className="font-display text-[1.875rem] font-semibold leading-tight tabular-nums">
            {card.value}
          </span>
          <span className="text-[0.8125rem] tabular-nums text-ink-muted">{card.hint}</span>
        </div>
      ))}
    </section>
  );
}
