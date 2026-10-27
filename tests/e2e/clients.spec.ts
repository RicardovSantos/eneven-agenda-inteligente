import { expect, test } from "@playwright/test";
import { loginAs, open, seedTenant, uniquePhone } from "./helpers";

for (const viewport of [
  { name: "celular 390px", width: 390, height: 844 },
  { name: "computador 1280px", width: 1280, height: 800 },
]) {
  test.describe(`clientes (${viewport.name})`, () => {
    test.use({ viewport: { width: viewport.width, height: viewport.height } });

    test("criar, achar na lista, abrir a ficha, editar observação e agendar", async ({ page, request }) => {
      const { slug } = await seedTenant(request);
      await loginAs(page, request, slug);
      await open(page, "/painel/clientes");
      await expect(page.getByText("Seus clientes aparecem aqui assim que agendarem pelo link.")).toBeVisible();

      // Novo cliente
      const phone = uniquePhone();
      await page.getByRole("button", { name: "Novo cliente" }).click();
      const dialog = page.getByRole("dialog", { name: "Novo cliente" });
      await expect(dialog).toBeVisible();
      await dialog.getByLabel("Nome", { exact: true }).fill("Marina Duarte");
      await dialog.getByLabel("WhatsApp").fill(phone);
      await dialog.getByRole("button", { name: "Salvar cliente" }).click();
      await expect(page.getByRole("status").filter({ hasText: "Cliente salvo" })).toBeVisible();

      // Cai na ficha do cliente novo
      await expect(page).toHaveURL(/\/painel\/clientes\/[0-9a-f-]{36}/);
      await expect(page.getByRole("heading", { level: 1, name: "Marina Duarte" })).toBeVisible();

      // Aparece na lista
      if (viewport.width < 1024) {
        await page.getByRole("link", { name: "Clientes", exact: true }).first().click();
        await expect(page).toHaveURL(/\/painel\/clientes$/);
      }
      await expect(page.getByRole("link", { name: /Marina Duarte/ }).first()).toBeVisible();

      // WhatsApp repetido: erro no campo e atalho para o cadastro existente
      await page.getByRole("button", { name: "Novo cliente" }).click();
      const again = page.getByRole("dialog", { name: "Novo cliente" });
      await again.getByLabel("Nome", { exact: true }).fill("Outra Pessoa");
      await again.getByLabel("WhatsApp").fill(phone);
      await again.getByRole("button", { name: "Salvar cliente" }).click();
      await expect(again.getByText("Já existe um cliente com esse WhatsApp.")).toBeVisible();
      await expect(again.getByRole("link", { name: "Abrir cadastro" })).toBeVisible();
      await again.getByRole("button", { name: "Voltar" }).last().click();
      await expect(again).toBeHidden();

      // Abre a ficha e edita a observação (salva ao sair do campo)
      await page.getByRole("link", { name: /Marina Duarte/ }).first().click();
      await expect(page.getByRole("heading", { level: 1, name: "Marina Duarte" })).toBeVisible();
      const notes = page.getByLabel("Observações");
      await notes.fill("Alergia a níquel: usar só titânio.");
      await notes.blur();
      await expect(page.getByRole("status").filter({ hasText: "Observações salvas" })).toBeVisible();
      await page.reload();
      await expect(page.getByLabel("Observações")).toHaveValue("Alergia a níquel: usar só titânio.");

      // Agendar: abre o novo agendamento com o cliente já escolhido
      await page.getByRole("button", { name: "Agendar" }).click();
      const booking = page.getByRole("dialog", { name: "Novo agendamento" });
      await expect(booking).toBeVisible();
      await expect(booking.getByText("Marina Duarte")).toBeVisible();
      await expect(booking.getByRole("button", { name: "Trocar cliente" })).toBeVisible();
    });
  });
}
