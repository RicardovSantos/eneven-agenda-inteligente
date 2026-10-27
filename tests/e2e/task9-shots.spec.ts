import path from "node:path";
import { expect, test } from "@playwright/test";
import { loginAs, open, randomIp, saoPauloDate, seedBooking, seedTenant } from "./helpers";

/** Capturas do acabamento do Plano 2. Só com `SHOTS_DIR`. */
const DIR = process.env.SHOTS_DIR;
test.skip(!DIR, "defina SHOTS_DIR para gerar as capturas");

const VARIANTS = [
  { name: "1280-claro", width: 1280, height: 800, colorScheme: "light" as const },
  { name: "1280-escuro", width: 1280, height: 800, colorScheme: "dark" as const },
  { name: "390-claro", width: 390, height: 844, colorScheme: "light" as const },
  { name: "390-escuro", width: 390, height: 844, colorScheme: "dark" as const },
];

for (const v of VARIANTS) {
  test(v.name, async ({ browser, request }) => {
    const desktop = v.width >= 1024;
    const context = await browser.newContext({
      viewport: { width: v.width, height: v.height },
      colorScheme: v.colorScheme,
      locale: "pt-BR",
      timezoneId: "America/Sao_Paulo",
      hasTouch: !desktop,
      baseURL: `http://localhost:${process.env.E2E_PORT ?? 3100}`,
      extraHTTPHeaders: { "x-forwarded-for": randomIp() },
    });
    const page = await context.newPage();
    const shot = (name: string) => page.screenshot({ path: path.join(DIR!, `${name}-${v.name}.png`) });

    const { slug } = await seedTenant(request, { extraProfessionals: ["Léo"] });
    const booked = await seedBooking(request, slug, { customerName: "Marina Costa", phone: "(11) 91111-2222" });
    await loginAs(page, request, slug);
    await open(page, `/painel?data=${saoPauloDate(booked.startsAt)}`);
    if (desktop) {
      await shot("01-menu-seu-link");
      await page.getByRole("button", { name: /Marina Costa/ }).click();
      await expect(page.getByRole("region", { name: "Marina Costa" })).toBeVisible();
      await shot("03-detalhe-desktop");
    } else {
      await open(page, "/painel/mais");
      await shot("01-mais-seu-link");
    }

    const publicPage = await context.newPage();
    await open(publicPage, `/${slug}`);
    await publicPage.getByLabel("Piercing hélix").check();
    await publicPage.getByRole("button", { name: "Continuar" }).click();
    await publicPage.getByLabel("Qualquer profissional disponível").check();
    await publicPage.getByRole("button", { name: "Continuar" }).click();
    await expect(publicPage.getByRole("group", { name: "Dias" })).toBeVisible();
    await expect(publicPage.locator("button[data-starts-at]").first()).toBeVisible();
    await publicPage.screenshot({ path: path.join(DIR!, `02-faixa-de-dias-${v.name}.png`) });
    await context.close();
  });
}
