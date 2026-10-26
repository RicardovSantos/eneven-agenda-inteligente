import path from "node:path";
import { expect, test, type APIRequestContext, type Browser, type Page } from "@playwright/test";
import { loginAs, open, randomIp, saoPauloDate, seedBlock, seedBooking, seedTenant } from "./helpers";

/**
 * Capturas de tela da agenda do painel (revisão visual). Só roda com `SHOTS_DIR`:
 *   SHOTS_DIR=capturas pnpm test:e2e tests/e2e/agenda-shots.spec.ts
 */
const DIR = process.env.SHOTS_DIR;
test.skip(!DIR, "defina SHOTS_DIR para gerar as capturas");

const VARIANTS = [
  { name: "1280-claro", width: 1280, height: 800, colorScheme: "light" as const },
  { name: "1280-escuro", width: 1280, height: 800, colorScheme: "dark" as const },
  { name: "390-claro", width: 390, height: 844, colorScheme: "light" as const },
  { name: "390-escuro", width: 390, height: 844, colorScheme: "dark" as const },
];

const NAMES = ["Ana Souza", "Carla Lima", "Juliana Reis", "Marina Costa", "Paula Mendes", "Renata Alves", "Bruna Dias", "Fernanda Luz"];
const TIMES = ["09:00", "10:00", "11:30", "14:00", "15:30", "17:00"];
const COUNTS = [3, 4, 6, 4, 5, 2, 6, 3, 5, 4];

const addDays = (date: string, days: number) =>
  new Date(Date.UTC(+date.slice(0, 4), +date.slice(5, 7) - 1, +date.slice(8, 10) + days)).toISOString().slice(0, 10);
const isSunday = (date: string) => new Date(`${date}T12:00:00Z`).getUTCDay() === 0;

/** Um mês de agenda movimentada em volta de hoje (domingos fechados). */
async function seedMonth(request: APIRequestContext, slug: string, today: string) {
  let n = 0;
  for (let offset = -6; offset <= 14; offset++) {
    const date = addDays(today, offset);
    if (isSunday(date) && offset !== 0) continue;
    const count = COUNTS[Math.abs(offset) % COUNTS.length];
    for (let i = 0; i < count; i++) {
      n++;
      const past = offset < 0;
      const status = past
        ? i === 1
          ? "no_show"
          : "completed"
        : offset === 0
          ? i < 2
            ? i === 0
              ? "completed"
              : "no_show"
            : i % 2 === 0
              ? "confirmed"
              : "scheduled"
          : i % 2 === 0
            ? "confirmed"
            : "scheduled";
      await seedBooking(request, slug, {
        startsAt: `${date}T${TIMES[i]}:00-03:00`,
        serviceIndex: i % 3,
        professionalIndex: i % 2,
        customerName: NAMES[(n + i) % NAMES.length],
        phone: `(11) 9${String(1_000_000 + n).padStart(4, "0").slice(-4)}-${String(2000 + n).slice(-4)}`,
        status,
      });
    }
  }
}

async function variantShots(browser: Browser, request: APIRequestContext, v: (typeof VARIANTS)[number]) {
  const context = await browser.newContext({
    viewport: { width: v.width, height: v.height },
    colorScheme: v.colorScheme,
    hasTouch: v.width < 600,
    extraHTTPHeaders: { "x-forwarded-for": randomIp() },
    locale: "pt-BR",
    timezoneId: "America/Sao_Paulo",
    baseURL: process.env.E2E_BASE_URL ?? `http://localhost:${process.env.E2E_PORT ?? 3100}`,
  });
  const page = await context.newPage();
  const shot = async (name: string) => {
    await page.evaluate(() => document.fonts.ready);
    await page.addStyleTag({ content: "nextjs-portal { display: none !important; }" });
    await page.waitForTimeout(600);
    await page.screenshot({ path: path.join(DIR!, `${v.name}-${name}.png`) });
  };

  const tenant = await seedTenant(request, { extraProfessionals: ["Léo"], color: "#B4237A" });
  const today = saoPauloDate(new Date().toISOString());
  await seedMonth(request, tenant.slug, today);
  // Próximo dia útil com agenda: bloqueio de almoço para todo o estabelecimento.
  let busyDay = addDays(today, 2);
  while (isSunday(busyDay)) busyDay = addDays(busyDay, 1);
  await seedBlock(request, tenant.slug, {
    startsAt: `${busyDay}T12:30:00-03:00`,
    endsAt: `${busyDay}T13:30:00-03:00`,
    reason: "Almoço",
  });
  // Dia vazio: um dia útil depois do que foi semeado.
  let emptyDay = addDays(today, 18);
  while (isSunday(emptyDay)) emptyDay = addDays(emptyDay, 1);

  await loginAs(page, request, tenant.slug);
  const desktop = v.width >= 1024;

  // Hoje: lista cheia com a linha do agora.
  await open(page, "/painel");
  await shot("01-agenda-hoje");

  // Dia com bloqueio.
  await open(page, `/painel?data=${busyDay}`);
  await shot("02-agenda-dia-com-bloqueio");

  // Dia vazio.
  await open(page, `/painel?data=${emptyDay}`);
  await expect(page.getByText("Nenhum agendamento neste dia.")).toBeVisible();
  await shot("03-agenda-vazia");

  // Detalhe.
  await open(page, `/painel?data=${busyDay}`);
  await page.locator("[data-booking-id]").nth(2).click();
  await expect(page.getByTestId("booking-detail")).toBeVisible();
  await shot("04-detalhe");
  await page.keyboard.press("Escape");

  // Novo agendamento.
  await page.getByRole("button", { name: "Novo agendamento" }).last().click();
  const dialog = page.getByRole("dialog", { name: "Novo agendamento" });
  await expect(dialog).toBeVisible();
  await shot("05-novo-agendamento-vazio");
  await dialog.getByRole("button", { name: "+ Novo cliente" }).click();
  await dialog.getByLabel("Nome do cliente").fill("Larissa Prado");
  await dialog.getByLabel("WhatsApp").fill("11977776666");
  await dialog.getByRole("button", { name: /Piercing hélix/ }).click();
  await expect(dialog.locator("button[data-starts-at]").first()).toBeVisible();
  await dialog.locator("button[data-starts-at]").nth(2).click();
  await shot("06-novo-agendamento-preenchido");
  await dialog.getByRole("button", { name: /^Voltar$|Fechar/ }).first().click();

  // Bloqueio.
  await page.getByRole("button", { name: "Bloquear horário" }).click();
  await expect(page.getByRole("dialog", { name: "Bloquear horário" })).toBeVisible();
  await shot("07-bloquear-horario");
  await page.keyboard.press("Escape");

  if (desktop) {
    await open(page, `/painel?data=${busyDay}&view=dia`);
    await expect(page.getByTestId("day-columns")).toBeVisible();
    await shot("08-visao-dia");
  }
  await context.close();
}

test.describe("capturas da agenda", () => {
  for (const variant of VARIANTS) {
    test(variant.name, async ({ browser, request }) => {
      test.setTimeout(480_000);
      await variantShots(browser, request, variant);
    });
  }
});

export type { Page };
