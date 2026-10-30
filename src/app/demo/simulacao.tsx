"use client";

import { useState } from "react";
import Link from "next/link";
import { demoServices as services, demoTimes as times } from "./dados";


export function DemoBooking() {
  const [service, setService] = useState<number | null>(null);
  const [time, setTime] = useState<string | null>(null);
  const [finished, setFinished] = useState(false);
  return (
    <main className="min-h-screen bg-canvas px-4 py-8 text-ink sm:py-14">
      <div className="mx-auto max-w-xl">
        <p className="text-sm font-semibold text-primary">Eneven Agenda · Demonstração</p>
        <h1 className="mt-4 font-heading text-3xl font-bold sm:text-4xl">Studio Exemplo</h1>
        <p className="mt-2 text-ink-muted">Veja como seus clientes podem escolher um serviço e um horário.</p>
        <p className="mt-5 rounded-xl border border-line bg-surface p-4 text-sm text-ink-muted">Esta é uma simulação: nenhum horário será reservado e nenhuma mensagem será enviada. <Link className="font-semibold text-primary underline" href="/demo/painel">Ver painel de exemplo</Link></p>
        {finished ? (
          <section className="mt-6 rounded-2xl border border-line bg-surface p-6" aria-live="polite">
            <h2 className="font-heading text-xl font-semibold">Simulação concluída</h2>
            <p className="mt-2 text-ink-muted">{services[service!].name} às {time}. Este agendamento é fictício.</p>
            <Link href={`/demo/painel?servico=${service}&horario=${encodeURIComponent(time ?? "")}`} className="mt-5 block font-semibold text-primary underline">Ver no painel de exemplo</Link>
            <button className="mt-6 rounded-xl bg-primary px-5 py-3 font-semibold text-white" onClick={() => { setService(null); setTime(null); setFinished(false); }}>Simular novamente</button>
          </section>
        ) : (
          <div className="mt-6 space-y-6">
            <section className="rounded-2xl border border-line bg-surface p-6">
              <h2 className="font-heading text-xl font-semibold">1. Escolha um serviço</h2>
              <div className="mt-4 space-y-2">{services.map((item, index) => (
                <button key={item.name} type="button" aria-pressed={service === index} onClick={() => { setService(index); setTime(null); }} className={`flex w-full items-center justify-between rounded-xl border p-4 text-left ${service === index ? "border-primary bg-primary-soft" : "border-line"}`}>
                  <span><span className="block font-semibold">{item.name}</span><span className="text-sm text-ink-muted">{item.duration}</span></span><span className="font-semibold">{item.price}</span>
                </button>
              ))}</div>
            </section>
            {service !== null && <section className="rounded-2xl border border-line bg-surface p-6">
              <h2 className="font-heading text-xl font-semibold">2. Escolha um horário</h2>
              <p className="mt-1 text-sm text-ink-muted">Horários ilustrativos</p>
              <div className="mt-4 grid grid-cols-2 gap-2 sm:grid-cols-4">{times.map((item) => <button key={item} type="button" aria-pressed={time === item} onClick={() => setTime(item)} className={`rounded-xl border px-3 py-3 font-semibold ${time === item ? "border-primary bg-primary-soft" : "border-line"}`}>{item}</button>)}</div>
              <button type="button" disabled={!time} onClick={() => setFinished(true)} className="mt-5 w-full rounded-xl bg-primary px-5 py-3 font-semibold text-white disabled:opacity-40">Concluir simulação</button>
            </section>}
          </div>
        )}
      </div>
    </main>
  );
}
