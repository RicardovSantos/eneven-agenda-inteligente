import { expect, test } from "@playwright/test";
import { loginAs, open, promoteToSuperAdmin, randomIp, seedTenant } from "./helpers";

test.use({ extraHTTPHeaders: { "x-forwarded-for": randomIp() } });

test.describe("super-admin com estabelecimento próprio: cada tela diz onde ele está", () => {
  test("no painel aparece 'Meu estabelecimento'; na administração, a faixa 'Painel administrativo' e o botão 'Voltar Home'", async ({ page, request }) => {
    const { slug } = await seedTenant(request, { name: "Studio Do Ricardo" });
    await loginAs(page, request, slug);
    await promoteToSuperAdmin(request, slug);

    // Painel: marcado como o estabelecimento dele, com atalho para a Plataforma.
    await open(page, "/painel");
    // Celular e computador têm uma marca cada; só a da largura atual aparece.
    await expect(page.getByText("Meu estabelecimento", { exact: true }).locator("visible=true")).toHaveCount(1);
    await expect(page.getByRole("note", { name: /Painel administrativo/ })).toHaveCount(0);
    await expect(page.getByRole("link", { name: "Ir para a Administração Eneven" })).toBeVisible();

    // "Mais" (celular): a administração fica separada das outras opções.
    await open(page, "/painel/mais");
    const admin = page.getByRole("region", { name: "Administração" });
    await expect(admin.getByRole("link", { name: /Administração Eneven/ })).toBeVisible();
    await expect(admin).toContainText("vale para todos os estabelecimentos");

    // Plataforma: faixa de contexto e um botão claro de ir ao próprio estabelecimento.
    await admin.getByRole("link", { name: /Administração Eneven/ }).click();
    await expect(page).toHaveURL(/\/admin$/);
    const faixa = page.getByRole("note", { name: /Painel administrativo/ });
    await expect(faixa).toHaveText("Painel administrativo");
    await page.getByRole("link", { name: "Voltar Home" }).click();
    await expect(page).toHaveURL(/\/painel$/);
  });

  test("dono comum não vê marca de super-admin nem atalho para a Plataforma", async ({ page, request }) => {
    const { slug } = await seedTenant(request);
    await loginAs(page, request, slug);
    await open(page, "/painel");
    await expect(page.getByText("Meu estabelecimento", { exact: true })).toHaveCount(0);
    await expect(page.getByRole("link", { name: "Ir para a Administração Eneven" })).toHaveCount(0);
  });
});
