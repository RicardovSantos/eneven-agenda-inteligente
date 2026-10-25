import { mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";
import { expect, test, type APIRequestContext, type Browser } from "@playwright/test";
import {
  chooseFirstSlot,
  chooseService,
  fillCustomer,
  open,
  randomIp,
  seedBooking,
  seedTenant,
  uniquePhone,
} from "./helpers";

/**
 * Capturas de tela da página pública (revisão visual). Só roda com `SHOTS_DIR`:
 *   SHOTS_DIR=capturas pnpm test:e2e tests/e2e/shots.spec.ts
 */
const DIR = process.env.SHOTS_DIR;
test.skip(!DIR, "defina SHOTS_DIR para gerar as capturas");

const VARIANTS = [
  { name: "390-claro", width: 390, height: 844, colorScheme: "light" as const },
  { name: "390-escuro", width: 390, height: 844, colorScheme: "dark" as const },
  { name: "1280-claro", width: 1280, height: 800, colorScheme: "light" as const },
];

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
    // Espera as fontes e os dados assentarem antes de fotografar.
    await page.evaluate(() => document.fonts.ready);
    // Esconde o indicador do Next em desenvolvimento (não faz parte da tela).
    await page.addStyleTag({ content: "nextjs-portal { display: none !important; }" });
    await page.waitForTimeout(700);
    await page.screenshot({ path: path.join(DIR!, `${v.name}-${name}.png`) });
  };

  const tenant = await seedTenant(request, { extraProfessionals: ["Léo"], color: "#B4237A" });

  // Fluxo completo.
  await open(page, `/${tenant.slug}`);
  await shot("01-servico");
  await chooseService(page, "Piercing hélix");
  await expect(page.getByRole("heading", { name: "Com quem você quer agendar?" })).toBeVisible();
  await shot("02-profissional");
  await page.getByRole("button", { name: "Continuar" }).click();
  await chooseFirstSlot(page);
  await shot("03-horario");
  await page.getByRole("button", { name: "Continuar" }).click();
  await expect(page.getByRole("heading", { name: "Seus dados" })).toBeVisible();
  await shot("04-dados");
  await fillCustomer(page, { name: "Paula Souza", phone: uniquePhone() });
  await page.getByRole("button", { name: "Confirmar agendamento" }).click();
  await expect(page.getByText("Marque a caixa")).toBeVisible();
  await shot("05-dados-erro-consentimento");
  await page.getByLabel(/Concordo com o uso dos meus dados/).check();
  await page.getByRole("button", { name: "Confirmar agendamento" }).click();
  await expect(page.getByRole("heading", { name: "Agendamento confirmado" })).toBeVisible();
  await page.waitForTimeout(900); // animação do fio terminar
  await shot("06-confirmado");

  // Marca com logo e outra cor.
  const withLogo = await seedTenant(request, {
    name: "Clínica Aurora",
    color: "#0E7C86",
    logoColor: "#0E7C86",
    extraProfessionals: ["Léo"],
  });
  await open(page, `/${withLogo.slug}`);
  await shot("07-servico-com-logo");

  // Horário tomado (um só profissional).
  const solo = await seedTenant(request);
  await open(page, `/${solo.slug}`);
  await chooseService(page, "Piercing hélix");
  const slot = await chooseFirstSlot(page);
  await page.getByRole("button", { name: "Continuar" }).click();
  await fillCustomer(page, { name: "Paula Souza", phone: uniquePhone() });
  await page.getByLabel(/Concordo com o uso dos meus dados/).check();
  await seedBooking(request, solo.slug, { startsAt: slot.startsAt, customerName: "Outra Cliente", phone: "(11) 91234-5678" });
  await page.getByRole("button", { name: "Confirmar agendamento" }).click();
  await expect(page.getByText("Esse horário acabou de ser reservado. Escolha outro.")).toBeVisible();
  await expect(page.locator("button[data-starts-at]").first()).toBeVisible();
  await shot("08-horario-tomado");

  // Indisponível e 404.
  const closed = await seedTenant(request, { verified: false });
  await open(page, `/${closed.slug}`);
  await shot("09-indisponivel");
  await open(page, "/nao-existe-mesmo");
  await shot("10-nao-encontrado");

  // Gerenciar agendamento.
  const normal = await seedBooking(request, tenant.slug);
  await open(page, `/agendamento/${normal.token}`);
  await shot("11-gerenciar");
  await page.getByRole("button", { name: "Remarcar" }).click();
  await chooseFirstSlot(page);
  await shot("12-gerenciar-remarcar");
  await page.getByRole("button", { name: "Voltar" }).click();
  await page.getByRole("button", { name: "Cancelar agendamento" }).click();
  await expect(page.getByRole("dialog")).toBeVisible();
  await shot("13-gerenciar-cancelar-dialogo");

  const soon = await seedBooking(request, tenant.slug, { startsInMinutes: 60, customerName: "Ana Lima", phone: "(11) 97777-1111" });
  await open(page, `/agendamento/${soon.token}`);
  await shot("14-gerenciar-fora-do-prazo");

  const canceled = await seedBooking(request, tenant.slug, { status: "canceled", customerName: "Bia Lima", phone: "(11) 96666-2222" });
  await open(page, `/agendamento/${canceled.token}`);
  await shot("15-gerenciar-cancelado");

  await context.close();
}

test("capturas de tela", async ({ browser, request }) => {
  test.setTimeout(900_000);
  mkdirSync(DIR!, { recursive: true });
  for (const v of VARIANTS) await variantShots(browser, request, v);

  // Imagem de prévia do link (Open Graph), com e sem logo.
  const page = await (await browser.newContext()).newPage();
  for (const [file, options] of [
    ["og-iniciais.png", { name: "Studio Defendi", color: "#B4237A" }],
    ["og-logo.png", { name: "Clínica Aurora de Beleza e Estética Integrada", color: "#0E7C86", logoColor: "#0E7C86" }],
  ] as const) {
    const tenant = await seedTenant(request, options);
    await open(page, `/${tenant.slug}`);
    const src = await page.locator('meta[property="og:image"]').getAttribute("content");
    const png = await request.get(new URL(src!).pathname + new URL(src!).search);
    expect(png.headers()["content-type"]).toBe("image/png");
    writeFileSync(path.join(DIR!, file), await png.body());
  }
});
