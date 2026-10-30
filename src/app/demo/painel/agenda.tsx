"use client";

import { useSyncExternalStore } from "react";
import { demoDay } from "../dados";

type Appointment = { time: string; name: string; service: string; simulated: boolean };
type Status = "agendado" | "confirmado" | "cancelado";
const labels: Record<Status, string> = { agendado: "Agendado", confirmado: "Confirmado", cancelado: "Cancelado" };

const storageKey = "eneven-demo-agenda";
const eventName = "eneven-demo-change";
const empty = "{}";
let fallback = "";

function readSnapshot() {
  try {
    let raw = fallback;
    try { raw = window.localStorage.getItem(storageKey) ?? fallback; } catch { /* Usa somente a memória desta página. */ }
    if (!raw) return empty;
    const stored = JSON.parse(raw);
    return stored.day === demoDay() && typeof stored.statuses === "object" && stored.statuses !== null ? JSON.stringify(stored.statuses) : empty;
  } catch { return empty; }
}

function subscribe(callback: () => void) {
  window.addEventListener(eventName, callback);
  window.addEventListener("storage", callback);
  const timer = window.setInterval(callback, 60_000);
  return () => { window.removeEventListener(eventName, callback); window.removeEventListener("storage", callback); window.clearInterval(timer); };
}

function saveStatuses(statuses: Record<string, Status>) {
  fallback = JSON.stringify({ day: demoDay(), statuses });
  try { window.localStorage.setItem(storageKey, fallback); } catch { /* Usa a memória desta página. */ }
  window.dispatchEvent(new Event(eventName));
}

/** Somente situações fictícias são guardadas no navegador até o próximo dia. */
export function DemoAgenda({ appointments }: { appointments: Appointment[] }) {
  const snapshot = useSyncExternalStore(subscribe, readSnapshot, () => empty);
  const statuses = JSON.parse(snapshot) as Record<string, Status>;
  function update(item: Appointment, status: Status) {
    const key = `${item.time}:${item.service}`;
    const next = { ...statuses, [key]: status };
    saveStatuses(next);
  }
  return (
    <section className="mt-6 rounded-2xl border border-line bg-surface p-6">
      <h2 className="font-heading text-xl font-semibold">Agenda de exemplo</h2>
      <p className="mt-1 text-sm text-ink-muted">Experimente confirmar ou cancelar. As alterações são fictícias e reiniciam diariamente neste navegador.</p>
      <ul className="mt-4 divide-y divide-line">
        {appointments.map((item) => {
          const saved = statuses[`${item.time}:${item.service}`];
          const status = saved === "confirmado" || saved === "cancelado" ? saved : "agendado";
          return <li key={item.time} className="flex flex-wrap items-center gap-x-4 gap-y-2 py-4">
            <span className={`font-semibold ${item.simulated ? "text-primary" : ""}`}>{item.time}</span>
            <span className="font-semibold">{item.name}</span><span className="text-ink-muted">{item.service}</span>
            <span className="text-sm text-ink-muted" aria-live="polite">{labels[status]}</span>
            <div className="flex w-full gap-2 sm:ml-auto sm:w-auto">
              {status === "agendado" && <button type="button" onClick={() => update(item, "confirmado")} aria-label={`Confirmar ${item.name} às ${item.time}`} className="rounded-lg border border-line px-3 py-2 text-sm font-semibold text-primary">Confirmar</button>}
              {status !== "cancelado" && <button type="button" onClick={() => update(item, "cancelado")} aria-label={`Cancelar ${item.name} às ${item.time}`} className="rounded-lg border border-line px-3 py-2 text-sm font-semibold text-ink-muted">Cancelar</button>}
              {status === "cancelado" && <button type="button" onClick={() => update(item, "agendado")} aria-label={`Restaurar ${item.name} às ${item.time}`} className="rounded-lg border border-line px-3 py-2 text-sm font-semibold text-primary">Restaurar</button>}
            </div>
          </li>;
        })}
      </ul>
    </section>
  );
}
