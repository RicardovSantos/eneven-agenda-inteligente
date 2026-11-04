import { expect, test } from "@playwright/test";
import { loginAsSuperAdmin, open, randomIp, seedTenant } from "./helpers";

test.use({ viewport: { width: 1280, height: 800 }, hasTouch: false, extraHTTPHeaders: { "x-forwarded-for": randomIp() } });

test("Plataforma: a ficha mostra os códigos da cobrança e a lista acha o estabelecimento pelo ID", async ({ page, request }) => {
  const { tenantId, slug } = await seedTenant(request, { name: "Studio Dos Codigos" });
  await loginAsSuperAdmin(page, request);

  // Busca pelo ID do estabelecimento.
  await open(page, `/admin?q=${encodeURIComponent(tenantId)}`);
  await expect(page.getByRole("link", { name: /Studio Dos Codigos/ })).toBeVisible();
  await expect(page.getByPlaceholder("Nome, link, e-mail ou código")).toBeVisible();

  // Ficha: bloco com o ID e sem cobrança ainda.
  await page.getByRole("link", { name: /Studio Dos Codigos/ }).click();
  await expect(page).toHaveURL(new RegExp(`/admin/estabelecimentos/${tenantId}$`));
  const codigos = page.getByRole("region", { name: "Códigos da cobrança" });
  await expect(codigos).toContainText(tenantId);
  await expect(codigos).toContainText("Nenhuma assinatura criada.");
  await expect(codigos).toContainText("Nenhum pagamento recebido.");
  expect(slug).toBeTruthy();

  // Um código que não existe não acha nada.
  await open(page, "/admin?q=codigo-que-nao-existe-123");
  await expect(page.getByRole("link", { name: /Studio Dos Codigos/ })).toHaveCount(0);
});
