import { expect, test } from "@playwright/test";
import {
  chooseFirstSlot,
  chooseService,
  fillCustomer,
  listBookings,
  open,
  randomIp,
  seedBooking,
  seedTenant,
} from "./helpers";

const CONFLICT = "Esse horário acabou de ser reservado. Escolha outro.";

// IP próprio deste arquivo: o limite de reservas por IP vale de verdade no servidor de desenvolvimento.
test.use({ extraHTTPHeaders: { "x-forwarded-for": randomIp() } });

test.describe("página pública de agendamento", () => {
  test("cliente agenda pelo fluxo inteiro e o agendamento aparece no banco", async ({ page, request }) => {
    const { slug } = await seedTenant(request, { extraProfessionals: ["Léo"] });

    await open(page, `/${slug}`);
    await expect(page.getByRole("heading", { name: "Studio Defendi", level: 1 })).toBeVisible();
    await expect(page).toHaveTitle("Agende no Studio Defendi");

    // Passo 1: serviço.
    await expect(page.getByRole("button", { name: "Continuar" })).toBeDisabled();
    await chooseService(page, "Piercing hélix");

    // Passo 2: dois profissionais fazem o serviço, então a escolha aparece.
    await expect(page.getByRole("heading", { name: "Com quem você quer agendar?" })).toBeVisible();
    await expect(page.getByLabel("Qualquer profissional disponível")).toBeChecked();
    await page.getByLabel("Léo").check();
    await page.getByRole("button", { name: "Continuar" }).click();

    // Passo 3: dia e horário.
    await expect(page.getByRole("heading", { name: "Escolha o dia e o horário" })).toBeVisible();
    await expect(page.getByText("com Léo")).toBeVisible();
    const slot = await chooseFirstSlot(page);
    await page.getByRole("button", { name: "Continuar" }).click();

    // Passo 4: dados (a máscara formata o WhatsApp).
    await expect(page.getByRole("heading", { name: "Seus dados" })).toBeVisible();
    await fillCustomer(page, { name: "Paula Souza", phone: "11987654321", email: "paula@exemplo.com" });
    await expect(page.getByLabel("WhatsApp")).toHaveValue("(11) 98765-4321");

    // Sem o consentimento não confirma.
    await page.getByRole("button", { name: "Confirmar agendamento" }).click();
    await expect(page.getByText("Marque a caixa para concordar com o uso dos seus dados.")).toBeVisible();
    expect(await listBookings(request, slug)).toHaveLength(0);

    await page.getByLabel(/Concordo com o uso dos meus dados/).check();
    await page.getByRole("button", { name: "Confirmar agendamento" }).click();

    // Confirmação no mesmo lugar, sem recarregar.
    await expect(page.getByRole("heading", { name: "Agendamento confirmado" })).toBeVisible();
    await expect(page.getByText("Te esperamos, Paula.")).toBeVisible();
    // A URL passa a ser a da gestão: recarregar não perde o link.
    await expect(page).toHaveURL(/\/agendamento\/[\w-]+$/);
    await expect(page.getByText("Piercing hélix")).toBeVisible();
    await expect(page.getByText("R$ 90,00 · pago no local")).toBeVisible();
    await expect(page.getByText("Rua Augusta, 120")).toBeVisible();
    const calendar = page.getByRole("link", { name: "Adicionar ao calendário" });
    await expect(calendar).toHaveAttribute("href", /^\/api\/agendamento\/[\w-]+\/ics$/);
    await expect(page.getByRole("link", { name: "Remarcar ou cancelar" })).toHaveAttribute(
      "href",
      /^\/agendamento\/[\w-]+$/,
    );
    await expect(page.getByRole("link", { name: "Falar com Studio Defendi no WhatsApp" })).toHaveAttribute(
      "href",
      "https://wa.me/5511987654321",
    );

    // O arquivo de calendário é válido.
    const ics = await request.get((await calendar.getAttribute("href"))!);
    expect(ics.status()).toBe(200);
    expect(ics.headers()["content-type"]).toContain("text/calendar");
    expect(await ics.text()).toContain(
      `DTSTART:${slot.startsAt.replace(/[-:]/g, "").replace(/\.\d{3}Z$/, "Z")}`,
    );

    // No banco: um agendamento público, do Léo, com os dados da cliente.
    const bookings = await listBookings(request, slug);
    expect(bookings).toHaveLength(1);
    expect(bookings[0]).toMatchObject({
      status: "scheduled",
      source: "public",
      startsAt: slot.startsAt,
      customerName: "Paula Souza",
      customerPhone: "5511987654321",
      customerEmail: "paula@exemplo.com",
      professional: "Léo",
      services: ["Piercing hélix"],
    });
  });

  test("com um só profissional o passo 2 é pulado e o Voltar do navegador volta um passo", async ({
    page,
    request,
  }) => {
    const { slug } = await seedTenant(request);
    await open(page, `/${slug}`);
    await chooseService(page, "Troca de joia");
    await expect(page.getByRole("heading", { name: "Escolha o dia e o horário" })).toBeVisible();
    await expect(page.getByText("com Bia")).toBeVisible();

    await chooseFirstSlot(page);
    await page.getByRole("button", { name: "Continuar" }).click();
    await expect(page.getByRole("heading", { name: "Seus dados" })).toBeVisible();

    await page.goBack();
    await expect(page.getByRole("heading", { name: "Escolha o dia e o horário" })).toBeVisible();
    await page.goBack();
    await expect(page.getByRole("heading", { name: "Escolha o serviço" })).toBeVisible();
    // A seleção continua.
    await expect(page.getByLabel("Troca de joia")).toBeChecked();
  });

  test("horário tomado: mostra o aviso, volta ao horário e mantém os dados", async ({ page, request }) => {
    const { slug } = await seedTenant(request);
    await open(page, `/${slug}`);
    await chooseService(page, "Piercing hélix");
    const slot = await chooseFirstSlot(page);
    await page.getByRole("button", { name: "Continuar" }).click();
    await fillCustomer(page, { name: "Paula Souza", phone: "11987654321" });
    await page.getByLabel(/Concordo com o uso dos meus dados/).check();

    // Outra pessoa reserva o mesmo horário antes.
    await seedBooking(request, slug, { startsAt: slot.startsAt, customerName: "Outra Cliente", phone: "(11) 91234-5678" });

    await page.getByRole("button", { name: "Confirmar agendamento" }).click();
    await expect(page.getByText(CONFLICT)).toBeVisible();
    await expect(page.getByRole("heading", { name: "Escolha o dia e o horário" })).toBeVisible();
    // O horário tomado não é mais oferecido.
    await expect(page.locator(`button[data-starts-at="${slot.startsAt}"]`)).toHaveCount(0);

    // Escolhe outro e os dados continuam preenchidos.
    await chooseFirstSlot(page);
    await page.getByRole("button", { name: "Continuar" }).click();
    await expect(page.getByLabel("Seu nome")).toHaveValue("Paula Souza");
    await expect(page.getByLabel("WhatsApp")).toHaveValue("(11) 98765-4321");
    await page.getByLabel(/Concordo com o uso dos meus dados/).check();
    await page.getByRole("button", { name: "Confirmar agendamento" }).click();
    await expect(page.getByRole("heading", { name: "Agendamento confirmado" })).toBeVisible();
    expect(await listBookings(request, slug)).toHaveLength(2);
  });

  test("estabelecimento sem e-mail confirmado, slug inexistente e slug reservado", async ({ page, request }) => {
    const { slug } = await seedTenant(request, { verified: false });
    await open(page, `/${slug}`);
    await expect(page.getByText("Agendamento online indisponível no momento.")).toBeVisible();
    await expect(page.getByRole("link", { name: "Falar com Studio Defendi no WhatsApp" })).toBeVisible();
    await expect(page.getByRole("button", { name: "Continuar" })).toHaveCount(0);

    const missing = await open(page, "/nao-existe-mesmo");
    expect(missing?.status()).toBe(404);
    await expect(page.getByText("Não encontramos esse estabelecimento.")).toBeVisible();

    const reserved = await open(page, "/ajuda");
    expect(reserved?.status()).toBe(404);
    await expect(page.getByText("Não encontramos esse estabelecimento.")).toBeVisible();
  });

  test("a prévia do link (Open Graph) usa o nome do salão", async ({ page, request }) => {
    const { slug } = await seedTenant(request, { name: "Salão da Maria", about: "Cortes e coloração." });
    await open(page, `/${slug}`);
    await expect(page.locator('meta[property="og:title"]')).toHaveAttribute("content", "Agende no Salão da Maria");
    await expect(page.locator('meta[name="description"]')).toHaveAttribute("content", "Cortes e coloração.");
    const image = await page.locator('meta[property="og:image"]').getAttribute("content");
    expect(image).toContain(`/${slug}/opengraph-image`);
    const png = await request.get(new URL(image!).pathname + new URL(image!).search);
    expect(png.status()).toBe(200);
    expect(png.headers()["content-type"]).toBe("image/png");
  });
});

test.describe("gerenciar agendamento", () => {
  test("token inválido: 404 sem revelar nada", async ({ page }) => {
    const response = await open(page, "/agendamento/token-que-nao-existe");
    expect(response?.status()).toBe(404);
    await expect(page.getByText("Não encontramos esse agendamento.")).toBeVisible();
  });

  test("cancela com confirmação e o agendamento fica cancelado no banco", async ({ page, request }) => {
    const { slug } = await seedTenant(request);
    const { token } = await seedBooking(request, slug);

    await open(page, `/agendamento/${token}`);
    await expect(page.getByRole("heading", { name: "Seu agendamento" })).toBeVisible();
    await expect(page.getByText("Paula Souza", { exact: false })).toHaveCount(0);
    await expect(page.getByRole("link", { name: "Adicionar ao calendário" })).toBeVisible();

    await page.getByRole("button", { name: "Cancelar agendamento" }).click();
    const dialog = page.getByRole("dialog");
    await expect(dialog.getByRole("heading", { name: "Cancelar este agendamento?" })).toBeVisible();
    // "Voltar" não cancela.
    await dialog.getByRole("button", { name: "Voltar" }).click();
    expect((await listBookings(request, slug))[0].status).toBe("scheduled");

    await page.getByRole("button", { name: "Cancelar agendamento" }).click();
    await page.getByRole("dialog").getByRole("button", { name: "Cancelar agendamento" }).click();
    await expect(page.getByText("Agendamento cancelado", { exact: true })).toBeVisible();
    await expect(page.getByRole("heading", { name: "Este agendamento foi cancelado." })).toBeVisible();
    await expect(page.getByRole("link", { name: "Agendar de novo" })).toHaveAttribute("href", `/${slug}`);
    expect((await listBookings(request, slug))[0].status).toBe("canceled");
  });

  test("remarca escolhendo outro dia e horário", async ({ page, request }) => {
    const { slug } = await seedTenant(request);
    const { token, startsAt } = await seedBooking(request, slug);

    await open(page, `/agendamento/${token}`);
    await page.getByRole("button", { name: "Remarcar" }).click();
    await expect(page.getByRole("heading", { name: "Escolha o novo dia e horário" })).toBeVisible();
    const slot = await chooseFirstSlot(page);
    await page.getByRole("button", { name: "Remarcar", exact: true }).click();

    await expect(page.getByText("Agendamento remarcado", { exact: true })).toBeVisible();
    await expect(page.getByRole("heading", { name: "Seu agendamento" })).toBeVisible();
    const [booking] = await listBookings(request, slug);
    expect(booking.startsAt).toBe(slot.startsAt);
    expect(booking.startsAt).not.toBe(startsAt);
  });

  test("fora do prazo: orienta a falar com o salão e não oferece mudar", async ({ page, request }) => {
    const { slug } = await seedTenant(request);
    const { token } = await seedBooking(request, slug, { startsInMinutes: 60 });

    await open(page, `/agendamento/${token}`);
    await expect(page.getByText("Para remarcar ou cancelar, fale com Studio Defendi.")).toBeVisible();
    await expect(page.getByRole("button", { name: "Remarcar" })).toHaveCount(0);
    await expect(page.getByRole("button", { name: "Cancelar agendamento" })).toHaveCount(0);
    await expect(page.getByRole("link", { name: "Falar com Studio Defendi no WhatsApp" })).toBeVisible();
  });

  test("agendamento cancelado mostra o aviso e o convite para agendar de novo", async ({ page, request }) => {
    const { slug } = await seedTenant(request);
    const { token } = await seedBooking(request, slug, { status: "canceled" });
    await open(page, `/agendamento/${token}`);
    await expect(page.getByRole("heading", { name: "Este agendamento foi cancelado." })).toBeVisible();
    await expect(page.getByRole("link", { name: "Agendar de novo" })).toBeVisible();
    // Cancelado não gera arquivo de calendário.
    const ics = await request.get(`/api/agendamento/${token}/ics`);
    expect(ics.status()).toBe(404);
  });
});
