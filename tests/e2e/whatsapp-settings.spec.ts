import { expect, test } from "@playwright/test";
import { loginAs, open, seedTenant } from "./helpers";

for (const viewport of [{ width: 390, height: 844 }, { width: 1280, height: 800 }]) {
  test(`preferências WhatsApp ${viewport.width}px`, async ({ page, request }) => {
    await page.setViewportSize(viewport);
    const { slug } = await seedTenant(request);
    await loginAs(page, request, slug);
    await open(page, "/painel/configuracoes/mensagens");
    await expect(page.getByRole("heading", { name: "Mensagens WhatsApp" })).toBeVisible();
    await expect(page.getByText(/0 de 50 mensagens usadas/)).toBeVisible();
    await expect(page.getByLabel("Lembrete 2 horas antes")).toBeDisabled();
    // Cada cartão liga e desliga e salva na hora, sem botão "Salvar" (commit ce95b97).
    await expect(page.getByRole("button", { name: "Salvar preferências" })).toHaveCount(0);
    await page.getByLabel("Lembrete na véspera").uncheck();
    await expect(page.getByRole("status").filter({ hasText: "Lembrete na véspera: desativado" })).toBeVisible();
    await page.reload();
    await expect(page.getByLabel("Lembrete na véspera")).not.toBeChecked();
    // Ligar de novo também salva na hora e continua depois de recarregar.
    await page.getByLabel("Lembrete na véspera").check();
    await expect(page.getByRole("status").filter({ hasText: "Lembrete na véspera: ativado" })).toBeVisible();
    await page.reload();
    await expect(page.getByLabel("Lembrete na véspera")).toBeChecked();
  });
}
