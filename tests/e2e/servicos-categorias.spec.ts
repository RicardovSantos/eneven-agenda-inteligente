import { expect, test, type Page } from "@playwright/test";
import { loginAs, open, seedTenant } from "./helpers";

const visible = (page: Page, text: string) => page.getByText(text).locator("visible=true").first();

test.describe("lista de serviços por categoria (painel)", () => {
  test("agrupa, filtra por chip, busca e abre o serviço para editar", async ({ page, request }) => {
    const { slug } = await seedTenant(request, { extraProfessionals: [] });
    await loginAs(page, request, slug);
    await open(page, "/painel/servicos");

    const novo = async (name: string, category: string) => {
      await page.getByRole("button", { name: "Novo serviço" }).first().click();
      await page.getByLabel("Nome", { exact: true }).fill(name);
      if (category) await page.getByLabel("Categoria").fill(category);
      await page.getByRole("button", { name: "Salvar" }).last().click();
      await expect(page.getByText("Serviço salvo")).toBeVisible();
      await page.getByText("Serviço salvo").waitFor({ state: "hidden" });
    };
    await novo("Corte masculino", "Cabelo");
    await novo("Progressiva", "Cabelo");
    await novo("Designer", "Sobrancelhas");
    await novo("Micropigmentação", "Sobrancelhas");
    await novo("Limpeza de pele", "");

    // Faixas de título, na ordem em que as categorias aparecem, "Outros serviços" por último.
    const sections = page.getByRole("region");
    await expect(page.getByRole("heading", { name: /Cabelo/ })).toBeVisible();
    await expect(page.getByRole("heading", { name: /Sobrancelhas/ })).toBeVisible();
    await expect(page.getByRole("heading", { name: /Outros serviços/ })).toBeVisible();
    await expect(sections.first()).toBeVisible();
    await page.screenshot({ path: "/tmp/servicos-lista.png", fullPage: true });

    // Chip filtra por categoria; "Todas" volta.
    const chips = page.getByRole("group", { name: "Filtrar serviços por grupo" });
    await chips.getByRole("button", { name: /^Sobrancelhas/ }).click();
    await expect(chips.getByRole("button", { name: /^Sobrancelhas/ })).toHaveAttribute("aria-pressed", "true");
    await expect(visible(page, "Designer")).toBeVisible();
    await expect(page.getByText("Corte masculino")).toHaveCount(0);
    await chips.getByRole("button", { name: /^Todas/ }).click();
    await expect(visible(page, "Corte masculino")).toBeVisible();

    // Busca ignora acento e destaca o trecho; as outras categorias somem.
    const busca = page.getByLabel("Pesquisar serviço");
    await busca.fill("micropigmentacao");
    await expect(visible(page, "Micropigmentação")).toBeVisible();
    await expect(page.locator("mark").locator("visible=true").first()).toBeVisible();
    await expect(page.getByText("Corte masculino")).toHaveCount(0);
    await expect(page.getByRole("heading", { name: /Cabelo/ })).toHaveCount(0);
    await page.screenshot({ path: "/tmp/servicos-busca.png", fullPage: true });

    // Sem resultado: mensagem e atalho para limpar.
    await busca.fill("zzzz");
    await expect(page.getByText("Nenhum serviço encontrado para “zzzz”")).toBeVisible();
    await page.getByRole("button", { name: "Mostrar todos os serviços" }).click();
    await expect(busca).toHaveValue("");
    await expect(visible(page, "Corte masculino")).toBeVisible();

    // Tocar no serviço continua abrindo a edição.
    await page.getByRole("button", { name: /Progressiva/ }).first().click();
    await expect(page.getByRole("heading", { name: "Editar serviço" })).toBeVisible();
  });

  test("sem nenhuma categoria não aparecem cabeçalhos nem chips", async ({ page, request }) => {
    const { slug } = await seedTenant(request, { extraProfessionals: [] });
    await loginAs(page, request, slug);
    await open(page, "/painel/servicos");
    await page.getByRole("button", { name: "Novo serviço" }).first().click();
    await page.getByLabel("Nome", { exact: true }).fill("Corte");
    await page.getByRole("button", { name: "Salvar" }).last().click();
    await expect(page.getByText("Serviço salvo")).toBeVisible();
    await expect(page.getByRole("heading", { name: /Outros serviços/ })).toHaveCount(0);
    await expect(page.getByRole("group", { name: "Filtrar serviços por grupo" })).toHaveCount(0);
    await expect(page.getByLabel("Pesquisar serviço")).toBeVisible();
  });
});
