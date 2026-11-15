import { expect, test } from "@playwright/test";
import { loginAs, open, seedTenant } from "./helpers";

test("regras: salvar em etapas mantém tudo o que foi escolhido", async ({ page, request }) => {
  const { slug } = await seedTenant(request, {});
  await loginAs(page, request, slug);
  await open(page, "/painel/configuracoes/regras");
  const save = page.getByRole("button", { name: "Salvar" });

  await page.getByLabel("Intervalo entre horários").selectOption("30");
  await page.getByLabel("Antecedência mínima").selectOption("120");
  await save.click();
  await expect(page.getByText("Alterações salvas")).toBeVisible();
  // Depois de salvar, a tela continua mostrando o que foi escolhido.
  await expect(page.getByLabel("Intervalo entre horários")).toHaveValue("30");
  await expect(page.getByLabel("Antecedência mínima")).toHaveValue("120");

  await page.getByLabel("Cliente pode cancelar ou remarcar até").selectOption("720");
  await expect(page.getByLabel("Intervalo entre horários")).toHaveValue("30");
  await page.getByText("Alterações salvas").waitFor({ state: "hidden" });
  await save.click();
  await expect(page.getByText("Alterações salvas")).toBeVisible();

  await page.reload();
  await expect(page.getByLabel("Intervalo entre horários")).toHaveValue("30");
  await expect(page.getByLabel("Antecedência mínima")).toHaveValue("120");
  await expect(page.getByLabel("Cliente pode cancelar ou remarcar até")).toHaveValue("720");
});

test("dados, cor e horário: vários salvamentos seguidos não perdem nada", async ({ page, request }) => {
  const { slug } = await seedTenant(request, {});
  await loginAs(page, request, slug);
  const save = page.getByRole("button", { name: "Salvar" });
  const saved = async () => {
    await expect(page.getByText("Alterações salvas")).toBeVisible();
    await page.getByText("Alterações salvas").waitFor({ state: "hidden" });
  };

  await open(page, "/painel/configuracoes/estabelecimento");
  await page.getByLabel("Instagram (opcional)").fill("@primeiro");
  await page.getByRole("radio", { name: /Turquesa/ }).click();
  await save.click();
  await saved();
  await expect(page.getByLabel("Instagram (opcional)")).toHaveValue("@primeiro");
  await page.getByLabel("Facebook (opcional)").fill("segundo");
  await save.click();
  await saved();
  await page.reload();
  await expect(page.getByLabel("Instagram (opcional)")).toHaveValue("primeiro");
  await expect(page.getByLabel("Facebook (opcional)")).toHaveValue("segundo");
  await expect(page.getByLabel("Outra cor (hex)")).toHaveValue("#0E7C86");

  await open(page, "/painel/configuracoes/horario");
  await page.getByLabel("Segunda, intervalo 1: de").fill("08:30");
  await save.click();
  await saved();
  await page.getByLabel("Segunda, intervalo 1: até").fill("19:00");
  await save.click();
  await saved();
  await page.reload();
  await expect(page.getByLabel("Segunda, intervalo 1: de")).toHaveValue("08:30");
  await expect(page.getByLabel("Segunda, intervalo 1: até")).toHaveValue("19:00");

  await open(page, "/painel/configuracoes/pagina");
  await page.getByLabel("Título sobre as imagens (opcional)").fill("Olá");
  await save.click();
  await saved();
  await page.getByLabel("Frase abaixo do título (opcional)").fill("Agende já");
  await save.click();
  await saved();
  await page.reload();
  await expect(page.getByLabel("Título sobre as imagens (opcional)")).toHaveValue("Olá");
  await expect(page.getByLabel("Frase abaixo do título (opcional)")).toHaveValue("Agende já");
});
