import { expect, test } from "@playwright/test";
import { loginAs, loginAsSuperAdmin, open, randomIp, seedTenant } from "./helpers";

// Tela larga (a plataforma e a agenda de computador) e IP próprio deste arquivo.
test.use({
  viewport: { width: 1280, height: 800 },
  hasTouch: false,
  extraHTTPHeaders: { "x-forwarded-for": randomIp() },
});

const unique = (label: string) => `${label} ${Math.random().toString(36).slice(2, 7)}`;

test.describe("plataforma", () => {
  test("lista com filtro por situação, estende o teste, entra como o estabelecimento e volta", async ({
    page,
    request,
  }) => {
    const trialName = unique("Aurora Teste");
    const blockedName = unique("Bloqueado");
    const trial = await seedTenant(request, { name: trialName });
    await seedTenant(request, { name: blockedName, status: "read_only" });
    await loginAsSuperAdmin(page, request);

    await open(page, "/admin");
    await expect(page.getByRole("heading", { level: 1, name: "Estabelecimentos" })).toBeVisible();
    await expect(page.getByRole("region", { name: "Números da plataforma" })).toContainText(
      "Receita mensal (MRR)",
    );
    await expect(page.getByRole("link", { name: new RegExp(trialName) })).toBeVisible();
    await expect(page.getByRole("link", { name: new RegExp(blockedName) })).toBeVisible();

    // Filtro por situação (vive na URL) e busca.
    await page
      .getByRole("navigation", { name: "Filtrar por situação" })
      .getByRole("link", { name: /Somente leitura/ })
      .click();
    await expect(page).toHaveURL(/situacao=read_only/);
    await expect(page.getByRole("link", { name: new RegExp(blockedName) })).toBeVisible();
    await expect(page.getByRole("link", { name: new RegExp(trialName) })).toHaveCount(0);

    await open(page, `/admin?q=${encodeURIComponent(trialName)}`);
    await expect(page.getByRole("link", { name: new RegExp(trialName) })).toBeVisible();
    await expect(page.getByRole("link", { name: new RegExp(blockedName) })).toHaveCount(0);

    // Ficha: estende o teste e o histórico mostra a linha.
    await page.getByRole("link", { name: new RegExp(trialName) }).click();
    await expect(page).toHaveURL(new RegExp(`/admin/estabelecimentos/${trial.tenantId}$`));
    await expect(page.getByRole("heading", { level: 1, name: trialName })).toBeVisible();
    await page.getByRole("button", { name: "+ 7 dias" }).click();
    await expect(page.getByRole("status").filter({ hasText: "Teste estendido em 7 dias" })).toBeVisible();
    await expect(page.getByRole("region", { name: "Histórico" })).toContainText(
      "estendeu o teste em 7 dias",
    );

    // Entrar como o estabelecimento: faixa de suporte no painel do salão.
    await page.getByRole("button", { name: "Entrar como o estabelecimento" }).click();
    await expect(page).toHaveURL(/\/painel$/);
    const banner = page.locator("[data-support-banner]");
    await expect(banner).toContainText(`Você está vendo como ${trialName} (suporte).`);
    await expect(
      page.getByRole("navigation", { name: "Principal" }).first().getByRole("link", { name: "Serviços" }),
    ).toBeVisible();

    // Voltar à plataforma: de volta à ficha, e o histórico registra o suporte.
    await banner.getByRole("button", { name: "Voltar à plataforma" }).click();
    await expect(page).toHaveURL(new RegExp(`/admin/estabelecimentos/${trial.tenantId}$`));
    await expect(page.locator("[data-support-banner]")).toHaveCount(0);
    const history = page.getByRole("region", { name: "Histórico" });
    await expect(history).toContainText("entrou como o estabelecimento");
    await expect(history).toContainText("saiu do modo suporte");
  });

  test("bloquear pede confirmação e a ficha passa a Somente leitura", async ({ page, request }) => {
    const name = unique("Para Bloquear");
    const tenant = await seedTenant(request, { name });
    await loginAsSuperAdmin(page, request);

    await open(page, `/admin/estabelecimentos/${tenant.tenantId}`);
    await page.getByRole("button", { name: "Bloquear", exact: true }).click();
    const dialog = page.getByRole("dialog", { name: `Bloquear ${name}?` });
    await expect(dialog).toBeVisible();
    await dialog.getByRole("button", { name: "Voltar" }).click();
    await expect(dialog).toBeHidden();

    await page.getByRole("button", { name: "Bloquear", exact: true }).click();
    await dialog.getByRole("button", { name: "Bloquear" }).click();
    await expect(page.getByRole("status").filter({ hasText: "Estabelecimento bloqueado" })).toBeVisible();
    await expect(page.getByRole("region", { name: "Assinatura" })).toContainText("Somente leitura");

    // "Cancelar conta" fica no menu "Mais ações" e também pede confirmação.
    await page.getByRole("button", { name: "Mais ações" }).click();
    await page.getByRole("menuitem", { name: "Cancelar conta" }).click();
    await expect(page.getByRole("dialog", { name: `Cancelar a conta de ${name}?` })).toBeVisible();
  });

  test("cria um estabelecimento, envia o acesso ao dono e edita um plano", async ({ page, request }) => {
    await loginAsSuperAdmin(page, request);
    const name = unique("Studio Novo");
    const email = `dono-${Math.random().toString(36).slice(2, 8)}@exemplo.com`;

    await open(page, "/admin/estabelecimentos/novo");
    await page.getByLabel("Nome do estabelecimento").fill(name);
    await page.getByLabel("Nome do dono").fill("Marina Duarte");
    await page.getByLabel("E-mail do dono").fill(email);
    await page.getByLabel("WhatsApp").fill("11996542210");
    await expect(page.getByLabel("Dias de teste")).toHaveValue("30");
    await page.getByRole("button", { name: "Criar estabelecimento" }).click();

    await expect(page).toHaveURL(/\/admin\/estabelecimentos\/[0-9a-f-]{36}$/);
    await expect(page.getByRole("heading", { level: 1, name })).toBeVisible();
    await expect(page.getByRole("status").filter({ hasText: "Estabelecimento criado" })).toBeVisible();

    await page.getByRole("button", { name: "Enviar acesso por e-mail" }).click();
    await expect(page.getByRole("status").filter({ hasText: "Acesso enviado por e-mail" })).toBeVisible();
    await expect(page.getByText(/Convite enviado em \d{2}\/\d{2}/)).toBeVisible();

    await page.getByRole("link", { name: "Planos", exact: true }).click();
    await expect(page.getByRole("heading", { level: 1, name: "Planos" })).toBeVisible();
    await page.getByRole("button", { name: "Essencial" }).click();
    const panel = page.getByRole("complementary", { name: "Editar plano" });
    await expect(panel).toBeVisible();
    await panel.getByLabel("Mensagens por mês").fill("250");
    await panel.getByRole("button", { name: "Salvar alterações" }).click();
    await expect(page.getByRole("status").filter({ hasText: "Plano salvo" })).toBeVisible();
    await expect(page.getByRole("row", { name: /Essencial/ })).toContainText("250");
  });

  test("proprietário comum não entra em /admin", async ({ page, request }) => {
    const { slug } = await seedTenant(request);
    await loginAs(page, request, slug);
    await page.goto("/admin");
    // Sem permissão, o guard manda para fora de /admin (para /entrar, que leva logado ao painel).
    await expect(page).not.toHaveURL(/\/admin/);
  });
});

test.describe("somente leitura no painel", () => {
  test("estabelecimento bloqueado mostra a faixa e desabilita novo agendamento e bloqueio", async ({
    page,
    request,
  }) => {
    const { slug } = await seedTenant(request, { status: "read_only" });
    await loginAs(page, request, slug);
    await open(page, "/painel");

    const banner = page.getByTestId("read-only-banner");
    await expect(banner).toContainText(
      "Sua agenda está em modo somente leitura: a página de agendamento está fora do ar e não dá para marcar novos horários.",
    );
    // Sem SUPPORT_WHATSAPP no servidor do e2e, não há botão de contato.
    await expect(banner.getByRole("link", { name: "Falar com a Eneven" })).toHaveCount(0);
    await expect(page.getByRole("button", { name: "Novo agendamento" }).first()).toBeDisabled();
    await expect(page.getByRole("button", { name: "Bloquear horário" })).toBeDisabled();
    await expect(page.locator("[data-support-banner]")).toHaveCount(0);
  });
});
