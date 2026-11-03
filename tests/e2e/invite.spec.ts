import { expect, test, type APIRequestContext } from "@playwright/test";
import { loginAs, open, randomIp, saoPauloDate, seedBooking, seedTenant } from "./helpers";

// IP próprio deste arquivo: aceitar convite tem limite por IP no servidor de desenvolvimento.
test.use({ extraHTTPHeaders: { "x-forwarded-for": randomIp() } });

const SECRET = process.env.E2E_SEED ?? "e2e-local-secret";

/** Convite emitido pelo proprietário; o token só existe por aqui (em produção vai por e-mail). */
async function seedInvite(request: APIRequestContext, body: Record<string, unknown>) {
  const response = await request.post("/api/e2e/seed", {
    headers: { "x-e2e-seed": SECRET },
    data: { action: "invite", ...body },
  });
  expect(response.ok(), `seed invite: ${response.status()}`).toBe(true);
  return (await response.json()) as { token: string; invitationId: string };
}

const uniqueEmail = (label: string) =>
  `${label}-${Math.random().toString(36).slice(2, 7)}-${Date.now()}@exemplo.com`;

test.describe("acessos da equipe", () => {
  test("profissional convidada cria a senha, vê só a própria agenda e perde o acesso quando removida", async ({
    page,
    request,
  }) => {
    // A dona (profissional 0) já tem acesso; a convidada é a profissional "Bia Souza" (1).
    const { slug } = await seedTenant(request, { extraProfessionals: ["Bia Souza", "Léo"] });
    const bia = await seedBooking(request, slug, { professionalIndex: 1, customerName: "Paula Souza", phone: "(11) 91111-1111" });
    await seedBooking(request, slug, { professionalIndex: 2, customerName: "Carla Dias", phone: "(11) 92222-2222" });
    const email = uniqueEmail("bia");
    const { token } = await seedInvite(request, {
      slug,
      name: "Bia Profissional",
      email,
      role: "staff",
      professionalIndex: 1,
    });

    // Link do convite: texto, senha e entrada no painel.
    await open(page, `/convite/${token}`);
    await expect(page.getByRole("heading", { level: 1, name: "Studio Defendi convidou você" })).toBeVisible();
    await expect(page.getByText("Você vai acessar a agenda como Profissional.")).toBeVisible();
    await expect(page.getByLabel("Nome")).toHaveValue("Bia Profissional");
    await page.locator("#password").fill("senha-forte-9");
    await page.getByRole("button", { name: "Criar acesso" }).click();
    await expect(page).toHaveURL(/\/painel$/);

    // Só Agenda e Clientes, e só os agendamentos da própria profissional.
    const nav = page.getByRole("navigation", { name: "Principal" }).first();
    for (const label of ["Agenda", "Clientes"]) {
      await expect(nav.getByRole("link", { name: label, exact: true })).toBeVisible();
    }
    for (const label of ["Serviços", "Equipe", "Painel", "Configurações"]) {
      await expect(nav.getByRole("link", { name: label, exact: true })).toHaveCount(0);
    }
    await open(page, `/painel?data=${saoPauloDate(bia.startsAt)}`);
    await expect(page.getByRole("button", { name: /Paula Souza/ })).toBeVisible();
    await expect(page.getByRole("button", { name: /Carla Dias/ })).toHaveCount(0);

    // O link é de uso único.
    const staffCookie = (await page.context().cookies()).find((c) => c.name === "ea_session");
    expect(staffCookie).toBeDefined();
    await page.context().clearCookies();
    await open(page, `/convite/${token}`);
    await expect(page.getByText("Este convite não vale mais. Peça um novo a quem convidou você.")).toBeVisible();

    // O proprietário remove o acesso.
    await loginAs(page, request, slug);
    await open(page, "/painel/configuracoes/acessos");
    const card = page.getByRole("region", { name: "Acessos da equipe" });
    await expect(card.getByText("Profissional · Bia Souza")).toBeVisible();
    await card.getByRole("button", { name: "Remover acesso de Bia Profissional" }).click();
    const dialog = page.getByRole("dialog", { name: "Remover o acesso de Bia Profissional?" });
    await expect(dialog.getByText("Bia Profissional não vai mais conseguir entrar no painel deste estabelecimento.")).toBeVisible();
    await dialog.getByRole("button", { name: "Remover acesso" }).click();
    await expect(page.getByRole("status").filter({ hasText: "Acesso removido" })).toBeVisible();
    await expect(card.getByText(email)).toHaveCount(0);

    // A próxima navegação da Bia (mesma sessão de antes) vai para /entrar.
    await page.context().clearCookies();
    await page.context().addCookies([
      { name: staffCookie!.name, value: staffCookie!.value, url: new URL(page.url()).origin },
    ]);
    await page.goto("/painel");
    await expect(page).toHaveURL(/\/entrar/);
  });

  test("proprietário convida pelo cartão e o convite aparece como enviado", async ({ page, request }) => {
    const { slug } = await seedTenant(request, { extraProfessionals: ["Bia Souza"] });
    await loginAs(page, request, slug);
    await open(page, "/painel/configuracoes/acessos");

    const card = page.getByRole("region", { name: "Acessos da equipe" });
    await expect(card.getByText("Proprietário")).toBeVisible();
    await card.getByRole("button", { name: "Convidar pessoa" }).click();

    const dialog = page.getByRole("dialog", { name: "Convidar pessoa" });
    await expect(dialog).toBeVisible();
    await dialog.getByLabel("Nome").fill("Rita Recepção");
    await dialog.getByLabel("E-mail").fill(uniqueEmail("rita"));
    await dialog.getByRole("button", { name: "Enviar convite" }).click();
    await expect(page.getByRole("status").filter({ hasText: "Convite enviado" })).toBeVisible();
    await expect(dialog).toBeHidden();

    const row = card.getByRole("listitem").filter({ hasText: "Rita Recepção" });
    await expect(row.getByText("Convite enviado", { exact: true })).toBeVisible();
    await expect(row.getByText("Recepção", { exact: true })).toBeVisible();

    // Profissional: o select de profissionais da equipe aparece.
    await card.getByRole("button", { name: "Convidar pessoa" }).click();
    await dialog.getByLabel("Nome").fill("Bia Convidada");
    await dialog.getByLabel("E-mail").fill(uniqueEmail("bia"));
    await dialog.getByLabel(/Profissional/).first().check();
    await dialog.getByLabel("Qual profissional da equipe").selectOption({ label: "Bia Souza" });
    await dialog.getByRole("button", { name: "Enviar convite" }).click();
    await expect(card.getByRole("listitem").filter({ hasText: "Bia Convidada" }).getByText("Profissional · Bia Souza")).toBeVisible();

    // Cancelar convite.
    await card
      .getByRole("listitem")
      .filter({ hasText: "Rita Recepção" })
      .getByRole("button", { name: "Cancelar convite" })
      .click();
    await expect(page.getByRole("status").filter({ hasText: "Convite cancelado" })).toBeVisible();
    await expect(card.getByRole("listitem").filter({ hasText: "Rita Recepção" })).toHaveCount(0);
  });
});
