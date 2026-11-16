import { expect, test } from "@playwright/test";
import { listBookings, loginAs, open, seedBooking, seedTenant } from "./helpers";

test("novo agendamento: busca de cliente, serviços por categoria, profissional com cor e rodapé fixo", async ({
  page,
  request,
}) => {
  const { slug } = await seedTenant(request, { extraProfessionals: ["Léo"] });
  await seedBooking(request, slug, { customerName: "Marina Costa", phone: "(11) 91111-2222" });
  await seedBooking(request, slug, { customerName: "Marina Duarte", phone: "(11) 93333-4444" });
  await loginAs(page, request, slug);
  await open(page, "/painel");

  await page.getByRole("button", { name: "Novo agendamento" }).first().click();
  const dialog = page.getByRole("dialog", { name: "Novo agendamento" });
  await expect(dialog).toBeVisible();

  // Rodapé fixo: Voltar e Agendar ficam à vista mesmo rolando o conteúdo até o fim.
  const agendar = dialog.getByRole("button", { name: "Agendar" });
  const voltar = dialog.getByRole("button", { name: "Voltar", exact: true }).last();
  await expect(agendar).toBeDisabled();
  const fixo = async () => {
    const caixa = (await dialog.boundingBox())!;
    for (const botao of [agendar, voltar]) {
      const b = (await botao.boundingBox())!;
      expect(b.y + b.height).toBeLessThanOrEqual(caixa.y + caixa.height + 1);
      expect(b.y).toBeGreaterThanOrEqual(caixa.y);
    }
  };
  await fixo();
  await dialog.locator("div.overflow-y-auto").first().evaluate((el) => el.scrollTo({ top: el.scrollHeight }));
  await fixo();
  await dialog.locator("div.overflow-y-auto").first().evaluate((el) => el.scrollTo({ top: 0 }));

  // Busca por nome: destaca o trecho e seleciona (fica roxo, com o marcador).
  const busca = dialog.getByLabel("Buscar cliente por nome ou WhatsApp");
  await busca.fill("marina");
  const costa = dialog.getByRole("button", { name: /Marina Costa/ });
  await expect(costa).toBeVisible();
  await expect(dialog.getByRole("button", { name: /Marina Duarte/ })).toBeVisible();
  await expect(costa.locator("mark")).toHaveText("Marina");
  await expect(costa).toHaveAttribute("aria-pressed", "false");
  await costa.click();
  await expect(costa).toHaveAttribute("aria-pressed", "true");
  await expect(costa).toHaveClass(/bg-primary-soft/);
  // Tocar de novo desmarca.
  await costa.click();
  await expect(costa).toHaveAttribute("aria-pressed", "false");

  // Busca por número do WhatsApp (sem máscara): acha e destaca os dígitos.
  await busca.fill("93333");
  const duarte = dialog.getByRole("button", { name: /Marina Duarte/ });
  await expect(duarte).toBeVisible();
  await expect(dialog.getByRole("button", { name: /Marina Costa/ })).toHaveCount(0);
  await expect(duarte.locator("mark")).toHaveText("93333");
  await duarte.click();
  await expect(duarte).toHaveAttribute("aria-pressed", "true");

  // Serviços (os do seed não têm categoria: lista simples, sem cabeçalhos de grupo).
  await expect(dialog.getByRole("group", { name: "Outros serviços" })).toHaveCount(0);
  await dialog.getByRole("button", { name: /Piercing tragus/ }).click();
  await expect(dialog.getByText(/1 serviço · /)).toBeVisible();

  // Profissional: lista com bolinha de cor, escolhe um e a escolha aparece no resumo.
  const seletor = dialog.getByRole("button", { name: /Profissional/ });
  await seletor.click();
  const lista = dialog.getByRole("listbox");
  await expect(lista).toBeVisible();
  const opcoes = lista.getByRole("option");
  expect(await opcoes.count()).toBeGreaterThanOrEqual(2);
  const cores = await lista.locator("[role=option] > span[aria-hidden]").first().evaluate((el) => getComputedStyle(el).backgroundColor);
  expect(cores).not.toBe("rgba(0, 0, 0, 0)");
  await page.keyboard.press("Escape");
  await expect(lista).toBeHidden();
  await expect(dialog).toBeVisible(); // Esc fechou só a lista, não o diálogo
  await seletor.click();
  await lista.getByRole("option", { name: /Qualquer profissional/ }).click();

  // Horário e agendamento.
  const slot = dialog.locator("button[data-starts-at]").first();
  await expect(slot).toBeVisible();
  await slot.click();
  await expect(dialog.getByText(/com qualquer profissional/)).toBeVisible();
  await page.screenshot({ path: "/tmp/novo-agendamento.png" });
  await agendar.click();
  await expect(page.getByRole("status").filter({ hasText: "Agendamento criado" })).toBeVisible();
  await expect.poll(async () => (await listBookings(request, slug)).length).toBe(3);
  const criado = (await listBookings(request, slug)).find((b) => b.customerName === "Marina Duarte" && b.source === "panel");
  expect(criado).toBeTruthy();
});

test("novo agendamento: serviços agrupados por categoria quando existem", async ({ page, request }) => {
  const { slug } = await seedTenant(request, {});
  await loginAs(page, request, slug);
  await open(page, "/painel/servicos");
  for (const [name, category] of [["Corte masculino", "Cabelo"], ["Designer", "Sobrancelhas"]]) {
    await page.getByRole("button", { name: "Novo serviço" }).first().click();
    await page.getByLabel("Nome", { exact: true }).fill(name);
    await page.getByLabel("Categoria").fill(category);
    await page.getByRole("button", { name: "Salvar" }).last().click();
    await expect(page.getByText("Serviço salvo")).toBeVisible();
    await page.getByText("Serviço salvo").waitFor({ state: "hidden" });
  }
  await open(page, "/painel");
  await page.getByRole("button", { name: "Novo agendamento" }).first().click();
  const dialog = page.getByRole("dialog", { name: "Novo agendamento" });
  const cabelo = dialog.getByRole("group", { name: "Cabelo" });
  await expect(cabelo).toBeVisible();
  await expect(dialog.getByRole("group", { name: "Sobrancelhas" })).toBeVisible();
  await expect(dialog.getByRole("group", { name: "Outros serviços" })).toBeVisible();
  await cabelo.getByRole("button", { name: /Corte masculino/ }).click();
  await expect(cabelo.getByText("1 marcado")).toBeVisible();
});
