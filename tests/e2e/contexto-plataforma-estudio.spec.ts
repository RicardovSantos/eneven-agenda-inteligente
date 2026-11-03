import { expect, test } from "@playwright/test";
import { loginAs, open, promoteToSuperAdmin, randomIp, seedTenant } from "./helpers";

test.use({ extraHTTPHeaders: { "x-forwarded-for": randomIp() } });

test.describe("super-admin com estabelecimento próprio: cada tela diz onde ele está", () => {
  test("no painel aparece 'Meu estabelecimento'; na Plataforma, a faixa 'vale para todos'", async ({ page, request }) => {
    const { slug } = await seedTenant(request, { name: "Studio Do Ricardo" });
    await loginAs(page, request, slug);
    await promoteToSuperAdmin(request, slug);

    // Painel: marcado como o estabelecimento dele, com atalho para a Plataforma.
    await open(page, "/painel");
    // Celular e computador têm uma marca cada; só a da largura atual aparece.
    await expect(page.getByText("Meu estabelecimento", { exact: true }).locator("visible=true")).toHaveCount(1);
    await expect(page.getByRole("note", { name: "Você está na Plataforma" })).toHaveCount(0);
    await expect(page.getByRole("link", { name: "Ir para a Plataforma" })).toBeVisible();

    // Plataforma: faixa de contexto e um botão claro de ir ao próprio estabelecimento.
    await page.getByRole("link", { name: "Ir para a Plataforma" }).click();
    await expect(page).toHaveURL(/\/admin$/);
    const faixa = page.getByRole("note", { name: "Você está na Plataforma" });
    await expect(faixa).toContainText("vale para todos os estabelecimentos");
    await page.getByRole("link", { name: /Meu estabelecimento/ }).click();
    await expect(page).toHaveURL(/\/painel$/);
  });

  test("dono comum não vê marca de super-admin nem atalho para a Plataforma", async ({ page, request }) => {
    const { slug } = await seedTenant(request);
    await loginAs(page, request, slug);
    await open(page, "/painel");
    await expect(page.getByText("Meu estabelecimento", { exact: true })).toHaveCount(0);
    await expect(page.getByRole("link", { name: "Ir para a Plataforma" })).toHaveCount(0);
  });
});
