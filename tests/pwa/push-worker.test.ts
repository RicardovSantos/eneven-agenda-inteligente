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

async function receive(w: Awaited<ReturnType<typeof worker>>, payload: unknown) {
  let task: Promise<unknown> = Promise.resolve();
  w.handlers.push({ data: { json: () => { if (payload === "invalid") throw new Error("invalid"); return payload; } }, waitUntil: (value: Promise<unknown>) => { task = value; } });
  await task;
}

it("mostra o nome do cliente, o serviço e o horário enviados pelo servidor, em português", async () => {
  const w = await worker();
  await receive(w, { type: "booking_created", title: "Novo agendamento", body: "Marina Costa · Corte feminino · ter, 17/11 às 10:30" });
  expect(w.showNotification).toHaveBeenLastCalledWith("Novo agendamento", expect.objectContaining({ body: "Marina Costa · Corte feminino · ter, 17/11 às 10:30", data: { destination: "/painel" } }));
});

it("sem texto do servidor usa uma frase genérica em português por tipo; payload inválido vira aviso geral", async () => {
  const w = await worker();
  await receive(w, { type: "booking_created" });
  expect(w.showNotification).toHaveBeenLastCalledWith("Novo agendamento", expect.objectContaining({ body: "Você recebeu um novo agendamento." }));
  await receive(w, { type: "booking_canceled" });
  expect(w.showNotification).toHaveBeenLastCalledWith("Agendamento cancelado", expect.objectContaining({ body: "Um agendamento foi cancelado." }));
  await receive(w, { type: "booking_rescheduled" });
  expect(w.showNotification).toHaveBeenLastCalledWith("Agendamento remarcado", expect.objectContaining({ body: "Um agendamento foi remarcado." }));
  await receive(w, "invalid");
  expect(w.showNotification).toHaveBeenLastCalledWith("Eneven Agenda", expect.objectContaining({ body: "Há uma atualização na sua agenda." }));
  await receive(w, { type: "outro" });
  expect(w.showNotification).toHaveBeenLastCalledWith("Eneven Agenda", expect.objectContaining({ body: "Há uma atualização na sua agenda." }));
});

it("ignora texto que não é string e corta texto grande demais", async () => {
  const w = await worker();
  await receive(w, { type: "booking_created", title: { x: 1 }, body: 42 });
  expect(w.showNotification).toHaveBeenLastCalledWith("Novo agendamento", expect.objectContaining({ body: "Você recebeu um novo agendamento." }));
  await receive(w, { type: "booking_created", title: "T".repeat(500), body: "B".repeat(900) });
  const [title, options] = w.showNotification.mock.calls.at(-1) as unknown as [string, { body: string }];
  expect(title).toHaveLength(80);
  expect(options.body).toHaveLength(200);
  await receive(w, null);
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
