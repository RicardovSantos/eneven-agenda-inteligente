import { readFile } from "node:fs/promises";
import { runInNewContext } from "node:vm";
import { expect, it, vi } from "vitest";

async function worker() {
  const handlers: Record<string, (event: unknown) => void> = {};
  const showNotification = vi.fn(async () => {});
  const openWindow = vi.fn(async () => {});
  const matchAll = vi.fn(async () => [] as Array<{ url: string; navigate: ReturnType<typeof vi.fn>; focus: ReturnType<typeof vi.fn> }>);
  const self = { addEventListener: (name: string, handler: (event: unknown) => void) => { handlers[name] = handler; }, location: { origin: "https://agenda.example" }, registration: { showNotification }, clients: { openWindow, matchAll } };
  runInNewContext(await readFile("scripts/pwa/sw.template.js", "utf8"), { self, URL });
  return { handlers, showNotification, openWindow, matchAll };
}

it("exibe texto fixo sem dados arbitrários e trata payload inválido", async () => {
  const w = await worker();
  let task: Promise<unknown> = Promise.resolve();
  w.handlers.push({ data: { json: () => ({ type: "booking_created", body: "informação privada" }) }, waitUntil: (value: Promise<unknown>) => { task = value; } });
  await task;
  expect(w.showNotification).toHaveBeenLastCalledWith("Eneven Agenda", expect.objectContaining({ body: "Você recebeu um novo agendamento." }));
  w.handlers.push({ data: { json: () => { throw new Error("invalid"); } }, waitUntil: (value: Promise<unknown>) => { task = value; } });
  await task;
  expect(w.showNotification).toHaveBeenLastCalledWith("Eneven Agenda", expect.objectContaining({ body: "Há uma atualização na sua agenda." }));
});

it("abre somente o painel da própria origem ao clicar", async () => {
  const w = await worker();
  let task: Promise<unknown> = Promise.resolve();
  const close = vi.fn();
  w.handlers.notificationclick({ notification: { close, data: { destination: "https://malicioso.example" } }, waitUntil: (value: Promise<unknown>) => { task = value; } });
  await task;
  expect(close).toHaveBeenCalledOnce();
  expect(w.openWindow).toHaveBeenCalledWith("https://agenda.example/painel");
  const navigate = vi.fn(async () => {});
  const focus = vi.fn(async () => {});
  w.matchAll.mockResolvedValue([{ url: "https://agenda.example/painel/clientes", navigate, focus }]);
  w.handlers.notificationclick({ notification: { close }, waitUntil: (value: Promise<unknown>) => { task = value; } });
  await task;
  expect(navigate).toHaveBeenCalledWith("https://agenda.example/painel");
  expect(focus).toHaveBeenCalledOnce();
});
