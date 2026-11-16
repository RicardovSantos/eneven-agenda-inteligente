import { expect, test } from "@playwright/test";
import { chooseFirstSlot, chooseService, fillCustomer, open, randomIp, seedTenant } from "./helpers";

// IP próprio: o limite de reservas por IP vale de verdade no servidor de desenvolvimento.
test.use({ extraHTTPHeaders: { "x-forwarded-for": randomIp() } });

async function ateSeusDados(page: import("@playwright/test").Page, slug: string) {
  await open(page, `/${slug}`);
  await chooseService(page, "Piercing hélix");
  await chooseFirstSlot(page);
  await page.getByRole("button", { name: "Continuar" }).click();
  await expect(page.getByRole("heading", { name: "Seus dados" })).toBeVisible();
}

test("agendamento: nome e WhatsApp do último agendamento já vêm preenchidos neste aparelho", async ({ page, request }) => {
  const { slug } = await seedTenant(request, { extraProfessionals: [] });

  // Primeira vez: campos vazios; agenda.
  await ateSeusDados(page, slug);
  await expect(page.getByLabel("Seu nome")).toHaveValue("");
  await expect(page.getByLabel("WhatsApp")).toHaveValue("");
  await expect(page.getByText("Preenchemos com os dados do seu último agendamento.")).toHaveCount(0);
  await fillCustomer(page, { name: "Paula Souza", phone: "11987654321", email: "paula@exemplo.com" });
  await page.getByLabel(/Concordo com o uso dos meus dados/).check();
  await page.getByRole("button", { name: "Confirmar agendamento" }).click();
  await expect(page.getByRole("heading", { name: "Agendamento confirmado" })).toBeVisible();

  // Segunda vez, mesmo aparelho: nome e WhatsApp preenchidos; e-mail e consentimento não.
  await ateSeusDados(page, slug);
  await expect(page.getByText("Preenchemos com os dados do seu último agendamento.")).toBeVisible();
  await expect(page.getByLabel("Seu nome")).toHaveValue("Paula Souza");
  await expect(page.getByLabel("WhatsApp")).toHaveValue("(11) 98765-4321");
  await expect(page.getByLabel("E-mail (opcional)")).toHaveValue("");
  await expect(page.getByLabel(/Concordo com o uso dos meus dados/)).not.toBeChecked();
  await page.screenshot({ path: "/tmp/cliente-lembrado.png", fullPage: true });

  // "Não é você? Limpar" apaga da tela e do aparelho.
  await page.getByRole("button", { name: "Não é você? Limpar" }).click();
  await expect(page.getByLabel("Seu nome")).toHaveValue("");
  await expect(page.getByLabel("WhatsApp")).toHaveValue("");
  await expect(page.getByText("Preenchemos com os dados do seu último agendamento.")).toHaveCount(0);
  await ateSeusDados(page, slug);
  await expect(page.getByLabel("Seu nome")).toHaveValue("");
  expect(await page.evaluate(() => window.localStorage.getItem("eneven:cliente"))).toBeNull();
});

test("agendamento: o que o cliente corrigiu não é sobrescrito e dado guardado inválido é ignorado", async ({ page, request }) => {
  const { slug } = await seedTenant(request, { extraProfessionals: [] });
  await open(page, `/${slug}`);
  await page.evaluate(() => window.localStorage.setItem("eneven:cliente", JSON.stringify({ name: "Paula Souza", phone: "(11) 98765-4321" })));
  await chooseService(page, "Piercing hélix");
  await chooseFirstSlot(page);
  await page.getByRole("button", { name: "Continuar" }).click();
  await expect(page.getByLabel("Seu nome")).toHaveValue("Paula Souza");
  // Corrige o nome, volta um passo e avança de novo: a correção continua (não volta para o guardado).
  await page.getByLabel("Seu nome").fill("Outra Pessoa");
  await page.goBack();
  await expect(page.getByRole("heading", { name: "Escolha o dia e o horário" })).toBeVisible();
  await page.getByRole("button", { name: "Continuar" }).click();
  await expect(page.getByLabel("Seu nome")).toHaveValue("Outra Pessoa");
  // Dado guardado inválido é ignorado (nada preenchido, sem erro).
  await page.evaluate(() => window.localStorage.setItem("eneven:cliente", "{lixo"));
  await open(page, `/${slug}`);
  await chooseService(page, "Piercing hélix");
  await chooseFirstSlot(page);
  await page.getByRole("button", { name: "Continuar" }).click();
  await expect(page.getByLabel("Seu nome")).toHaveValue("");
});
