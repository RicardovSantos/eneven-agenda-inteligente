import { expect, test } from "@playwright/test";
import {
  chooseFirstSlot,
  chooseService,
  fillCustomer,
  listBookings,
  loginAs,
  open,
  randomIp,
  saoPauloDate,
  seedBooking,
  seedTenant,
  uniquePhone,
} from "./helpers";

// IP próprio deste arquivo: a reserva pública tem limite por IP no servidor de desenvolvimento.
test.use({ extraHTTPHeaders: { "x-forwarded-for": randomIp() } });

test.describe("agenda do painel", () => {
  test("agendamento feito na página pública aparece na agenda; confirmar e cancelar pelo detalhe", async ({
    page,
    request,
  }) => {
    const { slug } = await seedTenant(request, { extraProfessionals: ["Léo"] });

    // Cliente agenda pela página pública.
    await open(page, `/${slug}`);
    await chooseService(page, "Piercing hélix");
    await page.getByLabel("Qualquer profissional disponível").check();
    await page.getByRole("button", { name: "Continuar" }).click();
    const slot = await chooseFirstSlot(page);
    await page.getByRole("button", { name: "Continuar" }).click();
    await fillCustomer(page, { name: "Paula Souza", phone: uniquePhone() });
    await page.getByLabel(/Concordo com o uso dos meus dados/).check();
    await page.getByRole("button", { name: "Confirmar agendamento" }).click();
    await expect(page.getByRole("heading", { name: "Agendamento confirmado" })).toBeVisible();

    // A equipe abre a agenda no dia do agendamento.
    await loginAs(page, request, slug);
    await open(page, `/painel?data=${saoPauloDate(slot.startsAt)}`);
    const row = page.getByRole("button", { name: new RegExp(`^${slot.time}, Paula Souza`) });
    await expect(row).toBeVisible();
    await expect(page.getByTestId("day-summary")).toContainText("1 agendamento · R$ 90,00 previstos");

    // Detalhe: confirmar presença.
    await row.click();
    const detail = page.getByRole("dialog", { name: "Paula Souza" });
    await expect(detail).toBeVisible();
    await expect(detail.getByText("Agendado", { exact: true })).toBeVisible();
    await expect(detail.getByText("R$ 90,00")).toBeVisible();
    await detail.getByRole("button", { name: "Confirmar presença" }).click();
    await expect(page.getByRole("status").filter({ hasText: "Presença confirmada" })).toBeVisible();
    await expect(detail.getByText("Confirmado", { exact: true })).toBeVisible();
    expect((await listBookings(request, slug))[0].status).toBe("confirmed");

    // Cancelar pede confirmação e oferece avisar pelo WhatsApp.
    await detail.getByRole("button", { name: "Cancelar agendamento" }).click();
    const confirm = page.getByRole("dialog", { name: "Cancelar este agendamento?" });
    await expect(confirm).toBeVisible();
    await confirm.getByRole("button", { name: "Voltar" }).click();
    expect((await listBookings(request, slug))[0].status).toBe("confirmed");

    await detail.getByRole("button", { name: "Cancelar agendamento" }).click();
    await confirm.getByRole("button", { name: "Cancelar agendamento" }).click();
    const toast = page.getByRole("status").filter({ hasText: "Agendamento cancelado" });
    await expect(toast).toBeVisible();
    await expect(toast.getByRole("link", { name: "Avisar pelo WhatsApp" })).toHaveAttribute(
      "href",
      /^https:\/\/wa\.me\/55119\d{8}\?text=Ol%C3%A1%2C%20Paula!/,
    );
    await expect(page.getByTestId("day-summary")).toContainText("Nenhum agendamento");
    expect((await listBookings(request, slug))[0].status).toBe("canceled");
  });

  test("dia sem agendamentos mostra o convite para compartilhar o link", async ({ page, request }) => {
    const { slug } = await seedTenant(request);
    await loginAs(page, request, slug);
    await open(page, "/painel");
    await expect(page.getByText("Nenhum agendamento neste dia. Compartilhe seu link para receber reservas.")).toBeVisible();
    await expect(page.getByRole("button", { name: "Copiar link" })).toBeVisible();
  });

  test.describe("computador", () => {
    test.use({ viewport: { width: 1280, height: 800 }, hasTouch: false });

    test("mês com contagem e ocupação, detalhe no painel, novo agendamento e bloqueio", async ({ page, request }) => {
      const { slug } = await seedTenant(request, { extraProfessionals: ["Léo"] });
      const booked = await seedBooking(request, slug, { customerName: "Marina Costa", phone: "(11) 91111-2222" });
      const date = saoPauloDate(booked.startsAt);

      await loginAs(page, request, slug);
      await open(page, `/painel?data=${date}`);
      await expect(page.getByRole("heading", { level: 1 })).toContainText("20");
      await expect(page.getByRole("link", { name: /1 agendamento/ }).first()).toBeVisible();

      // Detalhe abre na coluna da direita.
      await page.getByRole("button", { name: /Marina Costa/ }).click();
      const detail = page.getByRole("dialog", { name: "Marina Costa" });
      await expect(detail.getByText("(11) 91111-2222 · 1ª visita")).toBeVisible();
      await expect(detail.getByRole("link", { name: "Conversar com Marina no WhatsApp" })).toHaveAttribute(
        "href",
        "https://wa.me/5511911112222",
      );
      await detail.getByRole("button", { name: "Voltar ao dia" }).click();
      await expect(detail).toBeHidden();

      // Novo agendamento: cliente novo, serviço, primeiro horário livre.
      await page.getByRole("button", { name: "Novo agendamento" }).first().click();
      const dialog = page.getByRole("dialog", { name: "Novo agendamento" });
      await dialog.getByRole("button", { name: "+ Novo cliente" }).click();
      await dialog.getByLabel("Nome do cliente").fill("Renata Alves");
      await dialog.getByLabel("WhatsApp").fill("11922223333");
      await dialog.getByRole("button", { name: /Piercing tragus/ }).click();
      const slot = dialog.locator("button[data-starts-at]").first();
      await expect(slot).toBeVisible();
      await slot.click();
      await dialog.getByRole("button", { name: "Agendar" }).click();
      await expect(page.getByRole("status").filter({ hasText: "Agendamento criado" })).toBeVisible();
      await expect.poll(async () => (await listBookings(request, slug)).length).toBe(2);
      const created = (await listBookings(request, slug)).find((b) => b.customerName === "Renata Alves")!;
      expect(created.source).toBe("panel");

      // Bloquear horário.
      await open(page, `/painel?data=${date}`);
      await page.getByRole("button", { name: "Bloquear horário" }).click();
      const block = page.getByRole("dialog", { name: "Bloquear horário" });
      await block.getByLabel("Motivo (opcional)").fill("Almoço");
      await block.getByRole("button", { name: "Bloquear" }).click();
      await expect(page.getByRole("status").filter({ hasText: "Horário bloqueado" })).toBeVisible();
      await expect(page.getByText("Bloqueado · Almoço")).toBeVisible();
      await page.getByRole("button", { name: "Remover bloqueio Almoço" }).click();
      await expect(page.getByText("Bloqueado · Almoço")).toBeHidden();
    });
  });
});
