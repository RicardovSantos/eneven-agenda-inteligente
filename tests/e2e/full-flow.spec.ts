import { expect, test } from "@playwright/test";
import {
  chooseFirstSlot,
  chooseService,
  fillCustomer,
  listBookings,
  open,
  randomIp,
  saoPauloDate,
  uniquePhone,
  verifyOwnerEmail,
} from "./helpers";

// IP próprio: cadastro e reserva pública têm limite por IP no servidor de desenvolvimento.
test.use({
  extraHTTPHeaders: { "x-forwarded-for": randomIp() },
  viewport: { width: 1280, height: 800 },
  hasTouch: false,
});

test("do cadastro ao cancelamento: cadastro, primeiros passos, página pública, agenda, confirmar, remarcar e cancelar", async ({
  page,
  request,
}) => {
  const stamp = Date.now().toString(36);
  const businessName = `Espaço Aurora ${stamp}`;
  const email = `aurora-${stamp}@exemplo.com`;

  // 1. Cadastro com senha.
  await open(page, "/cadastro");
  await page.getByLabel("Nome do estabelecimento").fill(businessName);
  await page.getByLabel("Seu nome").fill("Aurora Lima");
  await page.getByLabel("WhatsApp").fill("11987654321");
  await page.getByLabel("E-mail").fill(email);
  await page.getByLabel("Senha", { exact: true }).fill("senha-forte-123");
  await page.getByRole("button", { name: "Criar minha agenda" }).click();

  // 2. Primeiros passos: as 4 etapas.
  await expect(page).toHaveURL(/\/painel\/comecar$/);
  await expect(page.getByRole("heading", { name: "Seu estabelecimento", level: 1 })).toBeVisible();
  await page.getByLabel("Endereço (opcional)").fill("Rua das Flores, 45");
  await page.getByRole("button", { name: "Continuar" }).click();

  await expect(page.getByRole("heading", { name: "Quando você atende?", level: 1 })).toBeVisible();
  await page.getByRole("button", { name: "Continuar" }).click();

  await expect(page.getByRole("heading", { name: "Quais serviços você oferece?", level: 1 })).toBeVisible();
  await page.getByLabel("Nome do serviço").fill("Corte feminino");
  await page.getByRole("button", { name: "Adicionar serviço" }).click();
  await expect(page.getByRole("list", { name: "Serviços adicionados" }).getByText("Corte feminino")).toBeVisible();
  await page.getByRole("button", { name: "Continuar" }).click();

  await expect(page.getByRole("heading", { name: "Quem atende?", level: 1 })).toBeVisible();
  await page.getByLabel("Adicionar outra pessoa").fill("Léo");
  await page.getByRole("button", { name: "Adicionar à equipe" }).click();
  await expect(page.getByRole("list", { name: "Equipe" }).getByText("Léo")).toBeVisible();
  await page.getByRole("button", { name: "Concluir" }).click();

  await expect(page.getByRole("heading", { name: "Sua agenda está pronta", level: 1 })).toBeVisible();
  const linkText = await page.getByText(/Agende seu horário online: agenda\.eneven\.com\.br\//).innerText();
  const slug = /br\/([a-z0-9-]+)/.exec(linkText)![1];
  expect(slug).toContain("espaco-aurora");

  // O e-mail ainda não foi confirmado: o link fica bloqueado no menu e na página pública.
  await page.getByRole("button", { name: "Ir para a agenda" }).click();
  await expect(page).toHaveURL(/\/painel$/);
  await expect(page.getByText("Confirme seu e-mail para liberar seu link", { exact: true })).toBeVisible();
  await open(page, `/${slug}`);
  await expect(page.getByText("Agendamento online indisponível no momento.")).toBeVisible();

  // Confirma o e-mail (no lugar de abrir o link recebido) e o link é liberado.
  await verifyOwnerEmail(request, slug);
  await open(page, "/painel");
  await expect(page.getByRole("button", { name: /Copiar link de agendamento: agenda\.eneven\.com\.br/ })).toBeVisible();

  // 3. Cliente agenda pela página pública (qualquer profissional).
  const customer = await page.context().browser()!.newContext({
    locale: "pt-BR",
    timezoneId: "America/Sao_Paulo",
    viewport: { width: 390, height: 844 },
    baseURL: `http://localhost:${process.env.E2E_PORT ?? 3100}`,
    extraHTTPHeaders: { "x-forwarded-for": randomIp() },
  });
  const publicPage = await customer.newPage();
  await open(publicPage, `/${slug}`);
  await expect(publicPage.getByRole("heading", { name: businessName, level: 1 })).toBeVisible();
  await chooseService(publicPage, "Corte feminino");
  await publicPage.getByLabel("Qualquer profissional disponível").check();
  await publicPage.getByRole("button", { name: "Continuar" }).click();
  const slot = await chooseFirstSlot(publicPage);
  await publicPage.getByRole("button", { name: "Continuar" }).click();
  await fillCustomer(publicPage, { name: "Paula Souza", phone: uniquePhone() });
  await publicPage.getByLabel(/Concordo com o uso dos meus dados/).check();
  await publicPage.getByRole("button", { name: "Confirmar agendamento" }).click();
  await expect(publicPage.getByRole("heading", { name: "Agendamento confirmado" })).toBeVisible();
  await customer.close();

  // 4. A agenda do painel mostra o agendamento.
  const day = saoPauloDate(slot.startsAt);
  await open(page, `/painel?data=${day}`);
  await expect(page.getByTestId("day-summary")).toContainText("1 agendamento");
  await page.getByRole("button", { name: /Paula Souza/ }).click();
  const detail = page.getByRole("region", { name: "Paula Souza" });
  await expect(detail.getByText("Agendado", { exact: true })).toBeVisible();

  // 5. Confirmar presença.
  await detail.getByRole("button", { name: "Confirmar presença" }).click();
  await expect(page.getByRole("status").filter({ hasText: "Presença confirmada" })).toBeVisible();
  await expect(detail.getByText("Confirmado", { exact: true })).toBeVisible();
  expect((await listBookings(request, slug))[0].status).toBe("confirmed");

  // 6. Remarcar para outro horário livre.
  const before = (await listBookings(request, slug))[0].startsAt;
  await detail.getByRole("button", { name: "Remarcar" }).click();
  // Escolhe um dia futuro para não depender dos horários restantes de hoje.
  await expect(detail.getByRole("group", { name: "Dias" }).getByRole("button").nth(1)).toBeVisible();
  const futureDay = detail.getByRole("group", { name: "Dias" }).getByRole("button").nth(1);
  await futureDay.click();
  await expect(futureDay).toHaveAttribute("aria-pressed", "true");
  const other = detail.locator(`button[data-starts-at]:not([data-starts-at="${before}"])`).first();
  await expect(other).toBeVisible();
  const newStart = (await other.getAttribute("data-starts-at"))!;
  expect(newStart).not.toBe(before);
  await other.click();
  await detail.getByRole("button", { name: "Remarcar" }).click();
  await expect(page.getByRole("status").filter({ hasText: "Agendamento remarcado" })).toBeVisible();
  await expect.poll(async () => (await listBookings(request, slug))[0].startsAt).toBe(newStart);

  // A remarcação pode cair em outro dia; abra o detalhe na data escolhida.
  await open(page, `/painel?data=${saoPauloDate(newStart)}`);
  await page.getByRole("button", { name: /Paula Souza/ }).click();

  // 7. Cancelar pelo diálogo de confirmação.
  await detail.getByRole("button", { name: "Cancelar agendamento" }).click();
  const confirm = page.getByRole("dialog", { name: "Cancelar este agendamento?" });
  await confirm.getByRole("button", { name: "Cancelar agendamento" }).click();
  await expect(page.getByRole("status").filter({ hasText: "Agendamento cancelado" })).toBeVisible();
  await expect.poll(async () => (await listBookings(request, slug))[0].status).toBe("canceled");
});
