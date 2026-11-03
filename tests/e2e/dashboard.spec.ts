import { expect, test } from "@playwright/test";
import { loginAs, loginAsMember, open, saoPauloDate, seedBooking, seedTenant } from "./helpers";

/** Hora cheia de São Paulo (UTC-3, sem horário de verão) no dia dado, como instante ISO. */
const at = (date: string, hour: number) => `${date}T${String(hour + 3).padStart(2, "0")}:00:00Z`;

for (const viewport of [
  { name: "celular 390px", width: 390, height: 844 },
  { name: "computador 1280px", width: 1280, height: 800 },
]) {
  const mobile = viewport.width < 1024;

  test.describe(`visão geral (${viewport.name})`, () => {
    test.use({ viewport: { width: viewport.width, height: viewport.height } });

    test("mostra os números do mês e resolve pendentes pelo diálogo", async ({ page, request }) => {
      const { slug } = await seedTenant(request, { extraProfessionals: ["Léo"] });
      // Tudo no mesmo dia (3 dias atrás) para o mês ser o mesmo em qualquer data de execução.
      const day = saoPauloDate(new Date(Date.now() - 3 * 86_400_000).toISOString());
      const month = day.slice(0, 7);
      // Atendidos: 90,00 (Bia) + 100,00 (Léo) = 190,00.
      await seedBooking(request, slug, { startsAt: at(day, 9), serviceIndex: 0, status: "completed", professionalIndex: 0, customerName: "Ana Lima", phone: "(11) 91111-1111" });
      await seedBooking(request, slug, { startsAt: at(day, 14), serviceIndex: 1, status: "completed", professionalIndex: 1, customerName: "Beto Reis", phone: "(11) 92222-2222" });
      // Sem resultado: 2 atendimentos já encerrados (o das 11h é o primeiro da lista).
      await seedBooking(request, slug, { startsAt: at(day, 11), serviceIndex: 0, professionalIndex: 0, customerName: "Carla Dias", phone: "(11) 93333-3333" });
      await seedBooking(request, slug, { startsAt: at(day, 16), serviceIndex: 2, professionalIndex: 1, customerName: "Davi Melo", phone: "(11) 94444-4444" });
      // Previsto: 1 marcado à frente (R$ 100,00).
      await seedBooking(request, slug, { serviceIndex: 1, professionalIndex: 0, customerName: "Eva Cruz", phone: "(11) 95555-5555" });

      await loginAs(page, request, slug);
      await open(page, `/painel/visao-geral?mes=${month}`);
      await expect(page.getByRole("heading", { level: 1, name: "Visão geral" })).toBeVisible();

      const money = (full: string, short: string) => page.getByText(mobile ? short : full, { exact: true }).first();
      await expect(money("R$ 190,00", "R$ 190")).toBeVisible();
      await expect(money("R$ 100,00", "R$ 100")).toBeVisible();
      if (!mobile) {
        await expect(page.getByText("2 atendimentos concluídos")).toBeVisible();
        await expect(page.getByText("Ticket médio R$ 95,00")).toBeVisible();
        await expect(page.getByRole("cell", { name: "R$ 90,00" })).toBeVisible(); // Bia
        await expect(page.getByRole("cell", { name: "R$ 100,00" })).toBeVisible(); // Léo
      }

      // Gráfico: descrição em texto e tabela para leitores de tela
      await expect(page.getByRole("img", { name: /Gráfico de barras: agendamentos por dia em/ })).toBeVisible();
      await expect(page.getByRole("table", { name: "Agendamentos por dia" })).toBeAttached();

      // Aviso e revisão
      await expect(
        page.getByText(mobile ? "2 atendimentos sem resultado" : "2 atendimentos que já terminaram estão sem resultado."),
      ).toBeVisible();
      await page.getByRole("button", { name: /Revisar agora/ }).click();
      const dialog = page.getByRole("dialog", { name: "Atendimentos sem resultado" });
      await expect(dialog).toBeVisible();
      await expect(dialog.getByRole("listitem")).toHaveCount(2);
      await expect(dialog.getByRole("listitem").first()).toContainText("Carla Dias");
      await expect(dialog.getByRole("listitem").first()).toContainText("Piercing hélix");

      await dialog.getByRole("button", { name: /^Atendido/ }).first().click();
      await expect(page.getByRole("status").filter({ hasText: "Marcado como atendido" })).toBeVisible();
      await expect(dialog.getByRole("listitem")).toHaveCount(1);
      await expect(dialog.getByRole("listitem").first()).toContainText("Davi Melo");

      await dialog.getByRole("button", { name: /^Faltou/ }).click();
      await expect(page.getByRole("status").filter({ hasText: "Marcado como falta" })).toBeVisible();
      await expect(dialog).toBeHidden();
      // Sem pendentes: o aviso some
      await expect(page.getByRole("button", { name: /Revisar agora/ })).toHaveCount(0);

      // Os números acompanham: +90,00 atendido; 1 falta de 4 atendimentos (25%)
      await page.reload();
      await expect(money("R$ 280,00", "R$ 280")).toBeVisible();
      await expect(page.getByText("25%", { exact: true })).toBeVisible();
    });

    test("tooltip do gráfico por hover/foco e mês vazio", async ({ page, request }) => {
      const { slug } = await seedTenant(request);
      const day = saoPauloDate(new Date(Date.now() - 2 * 86_400_000).toISOString());
      const month = day.slice(0, 7);
      await seedBooking(request, slug, { startsAt: at(day, 10), status: "completed", professionalIndex: 0 });
      await seedBooking(request, slug, { startsAt: at(day, 15), status: "completed", professionalIndex: 0, customerName: "Outra", phone: "(11) 96666-6666" });
      await loginAs(page, request, slug);
      await open(page, `/painel/visao-geral?mes=${month}`);

      const column = page.locator(`[data-day="${day}"]`);
      if (mobile) await column.tap();
      else await column.hover();
      await expect(page.getByTestId("day-tooltip")).toContainText("2 agendamentos");
      await expect(page.getByTestId("day-tooltip")).toContainText(
        /^(Domingo|Segunda|Terça|Quarta|Quinta|Sexta|Sábado), \d{1,2} de [a-zç]+ · /,
      );

      // Teclado: foco no gráfico e setas
      await page.getByRole("img", { name: /Gráfico de barras/ }).focus();
      await page.keyboard.press("ArrowLeft");
      await expect(page.getByTestId("day-tooltip")).toBeVisible();

      // Mês sem nada: texto e botão de copiar o link
      await open(page, "/painel/visao-geral?mes=2020-02");
      await expect(page.getByRole("button", { name: /Revisar agora/ })).toHaveCount(0);
      await expect(page.getByText("Ainda não há agendamentos neste mês.")).toBeVisible();
      await expect(page.getByRole("button", { name: "Copiar link", exact: true })).toBeVisible();
      await expect(page.getByText("Fevereiro de 2020")).toBeVisible();
      await page.getByRole("link", { name: "Próximo mês" }).click();
      await expect(page).toHaveURL(/mes=2020-03/);
      await expect(page.getByText("Março de 2020")).toBeVisible();

      // Mês inválido: cai no mês atual
      await open(page, "/painel/visao-geral?mes=bobagem");
      await expect(page.getByRole("heading", { level: 1, name: "Visão geral" })).toBeVisible();
    });
  });
}

test.describe("menu e acesso por papel", () => {
  test.use({ viewport: { width: 1280, height: 800 } });

  test("recepção: menu reduzido e visão geral/configurações redirecionam para a agenda", async ({ page, request }) => {
    const { slug } = await seedTenant(request);
    await loginAsMember(page, request, slug, "reception");
    await open(page, "/painel/visao-geral");
    await expect(page).toHaveURL(/\/painel$/);

    const nav = page.getByRole("navigation", { name: "Principal" }).first();
    for (const label of ["Agenda", "Clientes", "Serviços", "Equipe"]) {
      await expect(nav.getByRole("link", { name: label, exact: true })).toBeVisible();
    }
    for (const label of ["Painel", "Configurações", "Administração Eneven"]) {
      await expect(nav.getByRole("link", { name: label, exact: true })).toHaveCount(0);
    }
    await open(page, "/painel/configuracoes");
    await expect(page).toHaveURL(/\/painel$/);
    await open(page, "/painel/servicos");
    await expect(page).toHaveURL(/\/painel\/servicos$/);
  });

  test("profissional: só Agenda e Clientes; equipe redireciona", async ({ page, request }) => {
    const { slug } = await seedTenant(request);
    await loginAsMember(page, request, slug, "staff");
    await open(page, "/painel");
    const nav = page.getByRole("navigation", { name: "Principal" }).first();
    await expect(nav.getByRole("link")).toHaveCount(2);
    await open(page, "/painel/equipe");
    await expect(page).toHaveURL(/\/painel$/);
  });

  test("proprietário: seis itens e Painel abre a visão geral", async ({ page, request }) => {
    const { slug } = await seedTenant(request);
    await loginAs(page, request, slug);
    await open(page, "/painel");
    const nav = page.getByRole("navigation", { name: "Principal" }).first();
    await expect(nav.getByRole("link")).toHaveCount(6);
    await nav.getByRole("link", { name: "Painel", exact: true }).click();
    await expect(page).toHaveURL(/\/painel\/visao-geral/);
    await expect(nav.getByRole("link", { name: "Painel", exact: true })).toHaveAttribute("aria-current", "page");
  });
});
