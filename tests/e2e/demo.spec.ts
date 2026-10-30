import { expect, test } from "@playwright/test";

test("demonstra agendamento fictício e mostra o resultado no painel", async ({ page }) => {
  await page.goto("/demo");
  await expect(page.getByText("nenhum horário será reservado", { exact: false })).toBeVisible();
  await page.getByRole("button", { name: /Manicure/ }).click();
  await page.getByRole("button", { name: "10:30" }).click();
  await page.getByRole("button", { name: "Concluir simulação" }).click();
  await expect(page.getByRole("heading", { name: "Simulação concluída" })).toBeVisible();
  await page.getByRole("link", { name: "Ver no painel de exemplo" }).click();
  await expect(page.getByText("Sua simulação")).toBeVisible();
  await expect(page.getByRole("listitem").filter({ hasText: "Sua simulação" })).toContainText("Manicure");
  await expect(page.getByRole("listitem").nth(1)).toContainText("Sua simulação");
  await page.goto("/demo/painel?servico=1&horario=10%3A30&dia=2000-01-01");
  await expect(page.getByText("Sua simulação")).toHaveCount(0);
});
