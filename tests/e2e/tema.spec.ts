import { expect, test } from "@playwright/test";
import { loginAs, open, seedTenant } from "./helpers";

test("dono escolhe o tema em Configurações e a escolha fica salva", async ({ page, request }) => {
  const { slug } = await seedTenant(request);
  await page.emulateMedia({ colorScheme: "light" });
  await loginAs(page, request, slug);
  await open(page, "/painel/configuracoes");

  const html = page.locator("html");
  const secao = page.getByRole("region", { name: "Configuração geral" });
  await expect(secao).toBeVisible();
  await expect(secao.getByRole("radio", { name: /Automático/ })).toHaveAttribute("aria-checked", "true");
  await expect(html).not.toHaveClass(/\b(dark|light)\b/);

  await secao.getByRole("radio", { name: /Escuro/ }).click();
  await expect(html).toHaveClass(/\bdark\b/);
  await expect(secao.getByRole("radio", { name: /Escuro/ })).toHaveAttribute("aria-checked", "true");

  // Fica salvo ao recarregar, já com o tema aplicado.
  await page.reload();
  await expect(html).toHaveClass(/\bdark\b/);
  await expect(page.getByRole("region", { name: "Configuração geral" }).getByRole("radio", { name: /Escuro/ })).toHaveAttribute("aria-checked", "true");

  // Claro vence o tema escuro do aparelho.
  await page.emulateMedia({ colorScheme: "dark" });
  await page.getByRole("region", { name: "Configuração geral" }).getByRole("radio", { name: /Claro/ }).click();
  await expect(html).toHaveClass(/\blight\b/);
  await expect(page.locator("body")).toHaveCSS("background-color", "rgb(247, 246, 252)");

  await page.getByRole("region", { name: "Configuração geral" }).getByRole("radio", { name: /Automático/ }).click();
  await expect(html).not.toHaveClass(/\b(dark|light)\b/);
});
