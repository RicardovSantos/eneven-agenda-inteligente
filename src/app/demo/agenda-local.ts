"use client";

import { useSyncExternalStore } from "react";
import { demoDay, demoServices, demoTimes } from "./dados";

export type DemoSlot = { service: number; time: string };
const key = "eneven-demo-reservas";
const changed = "eneven-demo-reservas-change";
const empty = "[]";
let fallback = "";

function snapshot() {
  try {
    let raw = fallback;
    try { raw = window.localStorage.getItem(key) ?? fallback; } catch { /* Usa memória da página. */ }
    if (!raw) return empty;
    const saved = JSON.parse(raw);
    if (saved.day !== demoDay() || !Array.isArray(saved.slots)) return empty;
    const seen = new Set<string>();
    const slots = saved.slots.filter((item: unknown): item is DemoSlot => {
      if (!item || typeof item !== "object") return false;
      const row = item as Record<string, unknown>;
      if (typeof row.service !== "number" || !Number.isInteger(row.service) || row.service < 0 || row.service >= demoServices.length || typeof row.time !== "string" || !demoTimes.some((time) => time === row.time) || seen.has(row.time)) return false;
      seen.add(row.time);
      return true;
    }).map(({ service, time }: DemoSlot) => ({ service, time }));
    return JSON.stringify(slots);
  } catch { return empty; }
}

function subscribe(callback: () => void) {
  window.addEventListener(changed, callback);
  window.addEventListener("storage", callback);
  const timer = window.setInterval(callback, 60_000);
  return () => { window.removeEventListener(changed, callback); window.removeEventListener("storage", callback); window.clearInterval(timer); };
}

function save(slots: DemoSlot[]) {
  fallback = JSON.stringify({ day: demoDay(), slots });
  try { window.localStorage.setItem(key, fallback); } catch { /* Usa memória da página. */ }
  window.dispatchEvent(new Event(changed));
}

export function useDemoSlots(): DemoSlot[] {
  return JSON.parse(useSyncExternalStore(subscribe, snapshot, () => empty)) as DemoSlot[];
}

export function addDemoSlot(service: number, time: string): boolean {
  if (!Number.isInteger(service) || service < 0 || service >= demoServices.length || !demoTimes.some((item) => item === time)) return false;
  const slots = JSON.parse(snapshot()) as DemoSlot[];
  if (slots.some((item) => item.time === time)) return false;
  save([...slots, { service, time }]);
  return true;
}

export function resetDemo() {
  save([]);
}
