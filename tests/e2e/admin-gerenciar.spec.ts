import { expect, test } from "@playwright/test";
import { loginAsSuperAdmin, open, randomIp } from "./helpers";

test.use({
  viewport: { width: 1280, height: 800 },
  hasTouch: false,
  extraHTTPHeaders: { "x-forwarded-for": randomIp() },
});

test("Plataforma: a aba Gerenciar reúne as áreas em categorias e a lista fica só com estabelecimentos", async ({ page, request }) => {
  await loginAsSuperAdmin(page, request);

  // A lista de estabelecimentos não carrega mais os links de revisão soltos.
  await open(page, "/admin");
  await expect(page.getByRole("link", { name: /Revisar dados inativos/ })).toHaveCount(0);
  await expect(page.getByRole("heading", { name: "WhatsApp da plataforma", level: 2 })).toHaveCount(0);

  const nav = page.getByRole("navigation", { name: "Plataforma" });
  await nav.getByRole("link", { name: "Gerenciar" }).click();
  await expect(page).toHaveURL(/\/admin\/gerenciar$/);
  await expect(page.getByRole("heading", { name: "Gerenciar", level: 1 })).toBeVisible();

  const areas: Array<{ nome: RegExp; url: RegExp; titulo: string }> = [
    { nome: /^Planos e preços/, url: /\/admin\/planos$/, titulo: "" },
    { nome: /^WhatsApp da plataforma/, url: /\/admin\/whatsapp$/, titulo: "WhatsApp da plataforma" },
    { nome: /^Dados inativos/, url: /\/admin\/dados$/, titulo: "Revisão de dados inativos" },
  ];
  for (const { nome, url, titulo } of areas) {
    await page.getByRole("link", { name: nome }).click();
    await expect(page).toHaveURL(url);
    if (titulo) await expect(page.getByRole("heading", { name: titulo, level: 1 })).toBeVisible();
    await open(page, "/admin/gerenciar");
  }

  // As telas de revisão voltam para Gerenciar.
  await open(page, "/admin/whatsapp");
  await page.getByRole("link", { name: /‹ Gerenciar/ }).click();
  await expect(page).toHaveURL(/\/admin\/gerenciar$/);
});
