import { expect, test } from "@playwright/test";
import { loginAsSuperAdmin, open, randomIp } from "./helpers";

test.use({
  viewport: { width: 1280, height: 800 },
  hasTouch: false,
  extraHTTPHeaders: { "x-forwarded-for": randomIp() },
});

test("Plataforma: Pagamentos mostra o provedor padrão de cada forma e a Stripe só aparece no cartão, indisponível sem credenciais", async ({ page, request }) => {
  await loginAsSuperAdmin(page, request);
  await open(page, "/admin/gerenciar");
  await page.getByRole("link", { name: /^Pagamentos/ }).click();
  await expect(page).toHaveURL(/\/admin\/pagamentos$/);
  await expect(page.getByRole("heading", { name: "Pagamentos", level: 1 })).toBeVisible();
  await expect(page.getByText(/Assinaturas e cobranças existentes continuam no provedor original, inclusive nas renovações/)).toBeVisible();

  const card = page.getByRole("region", { name: "Cartão" });
  await expect(card.getByText("Padrão atual: Mercado Pago")).toBeVisible();
  const stripe = card.getByRole("radio", { name: /Stripe/ });
  await expect(stripe).toBeDisabled();
  await expect(card.getByText(/Faltam a chave secreta e o segredo do webhook da Stripe/)).toBeVisible();
  await expect(card.getByRole("button", { name: "Salvar" })).toBeDisabled();

  // Pix e boleto: só a Mercado Pago.
  for (const nome of ["Pix", "Boleto"]) {
    const region = page.getByRole("region", { name: nome });
    await expect(region.getByRole("radio", { name: /Stripe/ })).toHaveCount(0);
  }
});

test("Pagamentos é só do superadmin", async ({ page }) => {
  await page.goto("/admin/pagamentos");
  await expect(page).not.toHaveURL(/\/admin\/pagamentos$/);
});
