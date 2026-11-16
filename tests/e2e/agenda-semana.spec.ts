import { expect, test } from "@playwright/test";
import { loginAs, open, seedBooking, seedTenant } from "./helpers";

test.use({ viewport: { width: 1280, height: 900 }, hasTouch: false });

const SP = new Intl.DateTimeFormat("en-CA", { timeZone: "America/Sao_Paulo" });
const today = SP.format(new Date());
const plusDays = (date: string, n: number) => {
  const d = new Date(`${date}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
};
const weekday = (date: string) => new Date(`${date}T12:00:00Z`).getUTCDay();
const sunday = plusDays(today, -weekday(today));
const monday = plusDays(sunday, 1);
const wednesday = plusDays(sunday, 3);
const at = (date: string, time: string) => `${date}T${time}:00-03:00`;

test("agenda no computador: setas por visão, Hoje, Semana com blocos lado a lado e atalho para o Dia", async ({ page, request }) => {
  const { slug } = await seedTenant(request, { extraProfessionals: ["Léo"] });
  // Duas pessoas no mesmo horário (profissionais diferentes) + outro dia da semana.
  await seedBooking(request, slug, { customerName: "Marina Costa", phone: "(11) 91111-2222", startsAt: at(monday, "10:00"), professionalIndex: 0 });
  await seedBooking(request, slug, { customerName: "Renata Alves", phone: "(11) 92222-3333", startsAt: at(monday, "10:00"), professionalIndex: 1 });
  await seedBooking(request, slug, { customerName: "Paula Souza", phone: "(11) 93333-4444", startsAt: at(wednesday, "14:00"), professionalIndex: 0 });
  await loginAs(page, request, slug);

  // Seletor de visão: Mês | Semana | Dia, todos ativos.
  await open(page, "/painel?view=semana");
  const tabs = page.getByRole("tablist", { name: "Visualização" });
  await expect(tabs.getByRole("tab", { name: "Semana" })).toHaveAttribute("aria-selected", "true");
  await expect(tabs.getByRole("tab", { name: "Mês" })).toHaveAttribute("aria-selected", "false");
  await expect(page.getByTestId("agenda-title")).toHaveText(/^\d{1,2}( de \w{3})? – \d{1,2} de \w+/);

  // Sete colunas de dia e os blocos da semana.
  const grade = page.getByTestId("week-view");
  await expect(grade.getByRole("link", { name: /^Abrir / })).toHaveCount(7);
  const marina = grade.getByRole("button", { name: /Marina Costa/ });
  const renata = grade.getByRole("button", { name: /Renata Alves/ });
  await expect(marina).toBeVisible();
  await expect(renata).toBeVisible();
  await expect(grade.getByRole("button", { name: /Paula Souza/ })).toBeVisible();
  // Simultâneos ficam lado a lado (sem se cobrir).
  const a = (await marina.boundingBox())!;
  const b = (await renata.boundingBox())!;
  expect(a.x + a.width <= b.x + 1 || b.x + b.width <= a.x + 1).toBe(true);
  expect(Math.abs(a.y - b.y)).toBeLessThan(2);
  await page.screenshot({ path: "/tmp/semana-desktop.png" });

  // Setas: semana a semana; "Hoje" volta à semana de hoje.
  const hoje = page.getByRole("link", { name: "Hoje", exact: true });
  await expect(hoje).toHaveCount(0); // já estamos na semana de hoje: botão apagado (não é link)
  const tituloAtual = await page.getByTestId("agenda-title").textContent();
  await page.getByRole("link", { name: "Próxima semana" }).first().click();
  await expect(page).toHaveURL(new RegExp(`data=${plusDays(today, 7)}`));
  await expect(page.getByTestId("agenda-title")).not.toHaveText(tituloAtual!);
  await expect(page.getByRole("link", { name: "Hoje", exact: true })).toBeVisible();
  await page.getByRole("link", { name: "Semana anterior" }).first().click();
  await expect(page).toHaveURL(new RegExp(`data=${today}`));
  await expect(page.getByTestId("agenda-title")).toHaveText(tituloAtual!);
  await expect(page.getByRole("link", { name: "Hoje", exact: true })).toHaveCount(0);

  // Detalhe: clicar num bloco abre o detalhe (a coluna da direita só aparece nesse caso).
  await expect(page.getByRole("complementary", { name: "Agendamentos do dia" })).toBeHidden();
  await marina.click();
  await expect(page.getByRole("button", { name: "Voltar ao dia" })).toBeVisible();
  await page.getByRole("button", { name: "Voltar ao dia" }).click();
  await expect(page.getByRole("complementary", { name: "Agendamentos do dia" })).toBeHidden();

  // Cabeçalho do dia abre a visão Dia daquela data; as setas passam a ser de dia.
  await grade.getByRole("link", { name: new RegExp(`^Abrir ${["Dom", "Seg", "Ter", "Qua", "Qui", "Sex", "Sáb"][1]} `) }).click();
  await expect(page).toHaveURL(new RegExp(`data=${monday}.*view=dia|view=dia.*data=${monday}`));
  await expect(tabs.getByRole("tab", { name: "Dia" })).toHaveAttribute("aria-selected", "true");
  await page.getByRole("link", { name: "Próximo dia" }).click();
  await expect(page).toHaveURL(new RegExp(`data=${plusDays(monday, 1)}`));

  // Mês: as setas pulam de mês.
  await tabs.getByRole("tab", { name: "Mês" }).click();
  await expect(page.getByRole("link", { name: "Próximo mês" })).toBeVisible();
  await expect(page.getByRole("link", { name: "Mês anterior" })).toBeVisible();
});

test.describe("celular", () => {
  test.use({ viewport: { width: 390, height: 844 }, hasTouch: true });

  test("o celular segue como antes: faixa da semana e lista do dia, sem a grade nem o seletor de visão", async ({ page, request }) => {
    const { slug } = await seedTenant(request, {});
    await seedBooking(request, slug, { customerName: "Marina Costa", phone: "(11) 91111-2222", startsAt: at(wednesday, "14:00") });
    await loginAs(page, request, slug);
    await open(page, `/painel?view=semana&data=${wednesday}`);
    await expect(page.getByTestId("week-view")).toBeHidden();
    await expect(page.getByRole("tablist", { name: "Visualização" })).toBeHidden();
    await expect(page.getByRole("tablist", { name: "Dias da semana" })).toBeVisible();
    await expect(page.getByRole("button", { name: "Novo agendamento" })).toBeVisible();
    await expect(page.getByText("Marina Costa").locator("visible=true").first()).toBeVisible();
  });
});
