import { expect, test } from "@playwright/test";
import { loginAs, open, seedTenant } from "./helpers";

test("equipe: serviços do profissional agrupados por categoria que abre e fecha", async ({ page, request }) => {
  const { slug } = await seedTenant(request, { extraProfessionals: [] });
  await loginAs(page, request, slug);

  // Serviços em duas categorias.
  await open(page, "/painel/servicos");
  for (const [name, category] of [
    ["Corte masculino", "Cabelo"],
    ["Progressiva", "Cabelo"],
    ["Designer", "Sobrancelhas"],
  ]) {
    await page.getByRole("button", { name: "Novo serviço" }).first().click();
    await page.getByLabel("Nome", { exact: true }).fill(name);
    await page.getByLabel("Categoria").fill(category);
    await page.getByRole("button", { name: "Salvar" }).last().click();
    await expect(page.getByText("Serviço salvo")).toBeVisible();
    await page.getByText("Serviço salvo").waitFor({ state: "hidden" });
  }

  await open(page, "/painel/equipe");
  await page.getByRole("button", { name: "Novo profissional" }).first().click();
  await page.getByLabel("Nome", { exact: true }).fill("Duda");

  const cabelo = page.getByRole("button", { name: /^Cabelo/ });
  const sobrancelhas = page.getByRole("button", { name: /^Sobrancelhas/ });

  // Nasce tudo marcado e tudo recolhido; o contador aparece mesmo fechado.
  await expect(cabelo).toHaveAttribute("aria-expanded", "false");
  await expect(cabelo).toContainText("2 de 2");
  await expect(sobrancelhas).toContainText("1 de 1");
  await expect(page.getByLabel("Progressiva")).toBeHidden();

  // Abre, desmarca um serviço e recolhe: a escolha continua valendo.
  await cabelo.click();
  await expect(cabelo).toHaveAttribute("aria-expanded", "true");
  await page.getByLabel("Progressiva").uncheck();
  await expect(cabelo).toContainText("1 de 2");
  await cabelo.click();
  await expect(cabelo).toHaveAttribute("aria-expanded", "false");
  await expect(page.getByLabel("Progressiva")).toBeHidden();
  await expect(cabelo).toContainText("1 de 2");
  await page.screenshot({ path: "/tmp/equipe-recolhido.png", fullPage: true });

  // Salva e reabre: a escolha foi guardada.
  await page.getByRole("button", { name: "Salvar" }).last().click();
  await expect(page.getByText("Profissional salvo")).toBeVisible();
  await page.getByRole("button", { name: /Duda/ }).first().click();
  await expect(page.getByRole("button", { name: /^Cabelo/ })).toContainText("1 de 2");
  await page.getByRole("button", { name: /^Cabelo/ }).click();
  await expect(page.getByLabel("Corte masculino")).toBeChecked();
  await expect(page.getByLabel("Progressiva")).not.toBeChecked();
  await page.screenshot({ path: "/tmp/equipe-aberto.png", fullPage: true });
});
