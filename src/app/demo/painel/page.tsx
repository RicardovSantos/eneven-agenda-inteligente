import type { Metadata } from "next";
import Link from "next/link";
import { getDemoSelection } from "../dados";
import { DemoAgenda } from "./agenda";

export const metadata: Metadata = { title: "Painel de demonstração | Eneven", robots: { index: false, follow: false } };

export default async function DemoPanel({ searchParams }: { searchParams: Promise<{ servico?: string | string[]; horario?: string | string[]; dia?: string | string[] }> }) {
  const params = await searchParams;
  const selection = getDemoSelection(params.servico, params.horario, params.dia);
  const appointments = [
    { time: "08:00", name: "Ana", service: "Corte e finalização", simulated: false },
    { time: "11:00", name: "Beatriz", service: "Manicure", simulated: false },
    { time: "16:30", name: "Carla", service: "Escova", simulated: false },
    ...(selection ? [{ time: selection.time, name: "Sua simulação", service: selection.service.name, simulated: true }] : []),
  ].sort((a, b) => a.time.localeCompare(b.time));
  return (
    <main className="min-h-screen bg-canvas px-4 py-8 text-ink sm:py-14">
      <div className="mx-auto max-w-4xl">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div><p className="text-sm font-semibold text-primary">Eneven Agenda · Demonstração</p><h1 className="mt-3 font-heading text-3xl font-bold">Painel do Studio Exemplo</h1><p className="mt-2 text-ink-muted">Uma prévia da organização do seu dia.</p></div>
          <Link href="/demo" className="rounded-xl border border-line bg-surface px-4 py-3 text-sm font-semibold text-primary">Ver página do cliente</Link>
        </div>
        <p className="mt-6 rounded-xl border border-line bg-surface p-4 text-sm text-ink-muted">Dados fictícios. Esta prévia não acessa estabelecimentos reais nem envia mensagens.</p>
        <DemoAgenda appointments={appointments} />
      </div>
    </main>
  );
}
