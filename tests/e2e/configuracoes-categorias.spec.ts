import { expect, test } from "@playwright/test";
import { loginAs, open, seedTenant } from "./helpers";

const CATEGORIAS: Array<{ nome: string; href: string; titulo: string }> = [
  { nome: "Aparência", href: "aparencia", titulo: "Aparência" },
  { nome: "Plano e faturas", href: "assinatura", titulo: "Plano e faturas" },
  { nome: "Seus dados", href: "dados", titulo: "Seus dados" },
  { nome: "Dados e marca", href: "estabelecimento", titulo: "Dados e marca" },
  { nome: "Página de agendamento", href: "pagina", titulo: "Página de agendamento" },
  { nome: "Horário de atendimento", href: "horario", titulo: "Horário de atendimento" },
  { nome: "Regras de agendamento", href: "regras", titulo: "Regras de agendamento" },
  { nome: "Acessos da equipe", href: "acessos", titulo: "Acessos da equipe" },
  { nome: "Mensagens no WhatsApp", href: "mensagens", titulo: "" },
  { nome: "Notificações do aparelho", href: "notificacoes", titulo: "Notificações" },
];

test("Configurações é uma lista de categorias e cada uma abre sua tela", async ({ page, request }) => {
  const { slug } = await seedTenant(request);
  await loginAs(page, request, slug);
  await open(page, "/painel/configuracoes");

  // A tela inicial só lista; nenhum formulário aparece nela.
  await expect(page.getByRole("heading", { name: "Configurações", level: 1 })).toBeVisible();
  await expect(page.getByRole("button", { name: "Salvar" })).toHaveCount(0);
  for (const { nome, href } of CATEGORIAS) {
    await expect(page.getByRole("link", { name: new RegExp(nome) })).toHaveAttribute("href", `/painel/configuracoes/${href}`);
  }

  // Cada categoria abre a própria tela, com o caminho de volta para a lista.
  for (const { nome, href, titulo } of CATEGORIAS) {
    await page.getByRole("link", { name: new RegExp(nome) }).click();
    await expect(page).toHaveURL(new RegExp(`/painel/configuracoes/${href}$`));
    if (titulo) await expect(page.getByRole("heading", { name: titulo, level: 1 })).toBeVisible();
    await page.getByRole("link", { name: /Configurações/ }).first().click();
    await expect(page).toHaveURL(/\/painel\/configuracoes$/);
  }
});
