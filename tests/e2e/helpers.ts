import { expect, type APIRequestContext, type Page } from "@playwright/test";

/** Mesmo segredo de `scripts/e2e-server.mjs` (só vale no servidor de desenvolvimento do e2e). */
const SECRET = process.env.E2E_SEED ?? "e2e-local-secret";

async function seed<T>(request: APIRequestContext, body: Record<string, unknown>): Promise<T> {
  const response = await request.post("/api/e2e/seed", {
    headers: { "x-e2e-seed": SECRET },
    data: body,
  });
  expect(response.ok(), `seed ${String(body.action)}: ${response.status()}`).toBe(true);
  return (await response.json()) as T;
}

export type SeededTenant = {
  tenantId: string;
  slug: string;
  serviceIds: string[];
  professionalIds: string[];
};

export const seedTenant = (request: APIRequestContext, options: Record<string, unknown> = {}) =>
  seed<SeededTenant>(request, { action: "tenant", ...options });

export const seedBooking = (request: APIRequestContext, slug: string, options: Record<string, unknown> = {}) =>
  seed<{ bookingId: string; token: string; startsAt: string }>(request, {
    action: "booking",
    slug,
    ...options,
  });

export const seedBlock = (request: APIRequestContext, slug: string, options: Record<string, unknown>) =>
  seed<{ blockId: string }>(request, { action: "block", slug, ...options });

/** Entra no painel como proprietário do estabelecimento (cookie de sessão criado direto no banco). */
export async function loginAs(page: Page, request: APIRequestContext, slug: string) {
  const { token, cookieName } = await seed<{ token: string; cookieName: string }>(request, {
    action: "session",
    slug,
  });
  await page.context().addCookies([
    { name: cookieName, value: token, url: new URL(page.url() === "about:blank" ? baseUrl() : page.url()).origin },
  ]);
}

const baseUrl = () => `http://localhost:${process.env.E2E_PORT ?? 3100}`;

/** Dia local do salão ("yyyy-MM-dd") de um instante. */
export const saoPauloDate = (iso: string) =>
  new Intl.DateTimeFormat("en-CA", { timeZone: "America/Sao_Paulo" }).format(new Date(iso));

export type DbBooking = {
  id: string;
  status: string;
  source: string;
  startsAt: string;
  customerName: string;
  customerPhone: string;
  customerEmail: string | null;
  professional: string;
  services: string[];
};

export const listBookings = (request: APIRequestContext, slug: string) =>
  seed<DbBooking[]>(request, { action: "bookings", slug });

/** Escolhe o serviço pelo nome e segue para o próximo passo. */
export async function chooseService(page: Page, name: string) {
  await page.getByLabel(name).check();
  await page.getByRole("button", { name: "Continuar" }).click();
}

/** No passo do horário: espera os horários e escolhe o primeiro livre; devolve o instante e o texto. */
export async function chooseFirstSlot(page: Page) {
  const slot = page.locator("button[data-starts-at]").first();
  await expect(slot).toBeVisible();
  const startsAt = (await slot.getAttribute("data-starts-at"))!;
  const time = (await slot.textContent())!.trim();
  await slot.click();
  await expect(slot).toHaveAttribute("aria-pressed", "true");
  return { startsAt, time };
}

export async function fillCustomer(page: Page, data: { name: string; phone: string; email?: string }) {
  await page.getByLabel("Seu nome").fill(data.name);
  await page.getByLabel("WhatsApp").fill(data.phone);
  if (data.email) await page.getByLabel("E-mail (opcional)").fill(data.email);
}

/**
 * Abre a página e espera o React hidratar: em desenvolvimento a página chega
 * antes do JavaScript, e um clique nesse intervalo se perde.
 */
export async function open(page: Page, path: string) {
  const response = await page.goto(path);
  await page.waitForFunction(() => {
    const el = document.querySelector("h1, h2");
    return el !== null && Object.keys(el).some((key) => key.startsWith("__reactFiber"));
  });
  return response;
}

/**
 * Cada arquivo de teste usa um IP próprio (cabeçalho `x-forwarded-for`): o
 * limite de reservas (10 por 10 min por IP) vale de verdade no servidor de
 * desenvolvimento e todas as visitas do Playwright vêm do mesmo endereço.
 */
export function randomIp(): string {
  const part = () => 1 + Math.floor(Math.random() * 250);
  return `10.${part()}.${part()}.${part()}`;
}

/** WhatsApp novo a cada chamada (o limite de reservas também é por telefone: 5 por hora). */
export function uniquePhone(): string {
  const digits = String(Math.floor(Math.random() * 1e8)).padStart(8, "0");
  return `119${digits}`;
}
