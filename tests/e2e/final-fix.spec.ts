import path from "node:path";
import { expect, test } from "@playwright/test";
import { listBookings, loginAs, open, randomIp, seedBooking, seedTenant } from "./helpers";

/**
 * Correções da revisão final do Plano 2. As capturas só saem com `SHOTS_DIR`:
 *   SHOTS_DIR=capturas pnpm test:e2e tests/e2e/final-fix.spec.ts
 */
const DIR = process.env.SHOTS_DIR;
const SCHEMES = ["claro", "escuro"] as const;

test.use({ extraHTTPHeaders: { "x-forwarded-for": randomIp() } });

test("o manifest e o app instalável só aparecem no painel e na autenticação", async ({ request }) => {
  const { slug } = await seedTenant(request);
  const manifest = /<link[^>]+rel="manifest"/;
  const publicHtml = await (await request.get(`/${slug}`)).text();
  expect(publicHtml).not.toMatch(manifest);
  const { token } = await seedBooking(request, slug, {});
  const manageHtml = await (await request.get(`/agendamento/${token}`)).text();
  expect(manageHtml).not.toMatch(manifest);
  const loginHtml = await (await request.get("/entrar")).text();
  expect(loginHtml).toMatch(manifest);
  const manifestResponse = await request.get("/manifest.webmanifest");
  expect(manifestResponse.ok()).toBe(true);
  expect((await manifestResponse.json()).start_url).toBe("/painel");
});

for (const scheme of SCHEMES) {
  test(`gestão: confirmar presença pelo link (${scheme})`, async ({ browser, request }) => {
    const context = await browser.newContext({
      viewport: { width: 390, height: 844 },
      colorScheme: scheme === "claro" ? "light" : "dark",
      locale: "pt-BR",
      timezoneId: "America/Sao_Paulo",
      hasTouch: true,
      baseURL: `http://localhost:${process.env.E2E_PORT ?? 3100}`,
      extraHTTPHeaders: { "x-forwarded-for": randomIp() },
    });
    const page = await context.newPage();
    const { slug } = await seedTenant(request);
    const { token } = await seedBooking(request, slug, { customerName: "Marina Costa", phone: "(11) 91111-2222" });

    await open(page, `/agendamento/${token}`);
    await expect(page.getByText("Agendado", { exact: true })).toBeVisible();
    await expect(page.getByRole("button", { name: "Confirmar presença" })).toBeVisible();
    if (DIR) await page.screenshot({ path: path.join(DIR, `01-gestao-confirmar-390-${scheme}.png`), fullPage: true });

    await page.getByRole("button", { name: "Confirmar presença" }).click();
    await expect(page.getByText("Presença confirmada. Te esperamos!")).toBeVisible();
    await expect(page.getByText("Confirmado", { exact: true })).toBeVisible();
    await expect(page.getByRole("button", { name: "Confirmar presença" })).toHaveCount(0);
    await expect(page.getByRole("button", { name: "Remarcar" })).toBeVisible();
    await expect(page.getByRole("button", { name: "Cancelar agendamento" })).toBeVisible();
    expect((await listBookings(request, slug))[0].status).toBe("confirmed");
    if (DIR) await page.screenshot({ path: path.join(DIR, `02-gestao-confirmado-390-${scheme}.png`), fullPage: true });
    await context.close();
  });

  test(`configurações: horário e equipe (${scheme})`, async ({ browser, request }) => {
    const context = await browser.newContext({
      viewport: { width: 390, height: 844 },
      colorScheme: scheme === "claro" ? "light" : "dark",
      locale: "pt-BR",
      timezoneId: "America/Sao_Paulo",
      hasTouch: true,
      baseURL: `http://localhost:${process.env.E2E_PORT ?? 3100}`,
      extraHTTPHeaders: { "x-forwarded-for": randomIp() },
    });
    const page = await context.newPage();

    // Uma pessoa só na equipe: "Aplicar também à equipe" já vem marcado.
    const solo = await seedTenant(request);
    await loginAs(page, request, solo.slug);
    await open(page, "/painel/configuracoes/horario");
    const checkbox = page.getByLabel("Aplicar também à equipe");
    await expect(checkbox).toBeChecked();
    await checkbox.scrollIntoViewIfNeeded();
    if (DIR) await page.screenshot({ path: path.join(DIR, `03-horario-equipe-marcado-390-${scheme}.png`) });

    // Equipe com expedientes diferentes: desmarcado; salvar sem aplicar mostra o aviso.
    const team = await seedTenant(request, { extraProfessionals: ["Léo"] });
    await loginAs(page, request, team.slug);
    await open(page, "/painel/configuracoes/horario");
    const teamCheckbox = page.getByLabel("Aplicar também à equipe");
    await expect(teamCheckbox).not.toBeChecked();
    await page.getByLabel("Segunda, intervalo 1: de").fill("08:00");
    await page.getByLabel("Segunda, intervalo 1: até").fill("20:00");
    await teamCheckbox.scrollIntoViewIfNeeded();
    await page.locator('section[aria-labelledby="hours-title"]').getByRole("button", { name: "Salvar" }).click();
    const warning = page.getByText("O expediente da equipe não mudou.");
    await expect(warning).toBeVisible();
    await expect(page.getByRole("link", { name: "Equipe", exact: true }).last()).toHaveAttribute("href", "/painel/equipe");
    await warning.scrollIntoViewIfNeeded();
    if (DIR) await page.screenshot({ path: path.join(DIR, `04-horario-equipe-aviso-390-${scheme}.png`) });
    await context.close();
  });
}
