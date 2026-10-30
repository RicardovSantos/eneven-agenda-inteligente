"use client";

import { useState } from "react";

type Appointment = { time: string; name: string; service: string; simulated: boolean };
type Status = "agendado" | "confirmado" | "cancelado";
const labels: Record<Status, string> = { agendado: "Agendado", confirmado: "Confirmado", cancelado: "Cancelado" };

/** Interações ilustrativas permanecem somente na página aberta. */
export function DemoAgenda({ appointments }: { appointments: Appointment[] }) {
  const [statuses, setStatuses] = useState<Record<string, Status>>({});
  function update(time: string, status: Status) {
    setStatuses((previous) => ({ ...previous, [time]: status }));
  }
  return (
    <section className="mt-6 rounded-2xl border border-line bg-surface p-6">
      <h2 className="font-heading text-xl font-semibold">Agenda de exemplo</h2>
      <p className="mt-1 text-sm text-ink-muted">Experimente confirmar ou cancelar. As alterações são fictícias e desaparecem ao recarregar.</p>
      <ul className="mt-4 divide-y divide-line">
        {appointments.map((item) => {
          const status = statuses[item.time] ?? "agendado";
          return <li key={item.time} className="flex flex-wrap items-center gap-x-4 gap-y-2 py-4">
            <span className={`font-semibold ${item.simulated ? "text-primary" : ""}`}>{item.time}</span>
            <span className="font-semibold">{item.name}</span><span className="text-ink-muted">{item.service}</span>
            <span className="text-sm text-ink-muted" aria-live="polite">{labels[status]}</span>
            <div className="flex w-full gap-2 sm:ml-auto sm:w-auto">
              {status === "agendado" && <button type="button" onClick={() => update(item.time, "confirmado")} aria-label={`Confirmar ${item.name} às ${item.time}`} className="rounded-lg border border-line px-3 py-2 text-sm font-semibold text-primary">Confirmar</button>}
              {status !== "cancelado" && <button type="button" onClick={() => update(item.time, "cancelado")} aria-label={`Cancelar ${item.name} às ${item.time}`} className="rounded-lg border border-line px-3 py-2 text-sm font-semibold text-ink-muted">Cancelar</button>}
              {status === "cancelado" && <button type="button" onClick={() => update(item.time, "agendado")} aria-label={`Restaurar ${item.name} às ${item.time}`} className="rounded-lg border border-line px-3 py-2 text-sm font-semibold text-primary">Restaurar</button>}
            </div>
          </li>;
        })}
      </ul>
    </section>
  );
}
