import { expect, test } from "@playwright/test";
import { loginAs, open, seedTenant } from "./helpers";

test("agenda no celular: profissionais numa linha que rola, escolher e voltar para Todos", async ({ page, request }) => {
  const { slug } = await seedTenant(request, {
    extraProfessionals: ["Léo Alves", "Bia Souza", "Caio Lima", "Duda Reis", "Eva Moraes", "Gil Santos"],
  });
  await loginAs(page, request, slug);
  await open(page, "/painel");

  const grupo = page.getByRole("group", { name: "Profissional" });
  await expect(grupo).toBeVisible();

  // Uma linha só: todos os itens na mesma altura e a linha rola para o lado.
  const geometria = await grupo.evaluate((el) => {
    const tops = [...el.querySelectorAll("a")].map((a) => Math.round(a.getBoundingClientRect().top));
    return { linhas: new Set(tops).size, rola: el.scrollWidth > el.clientWidth };
  });
  expect(geometria.linhas).toBe(1);
  expect(geometria.rola).toBe(true);

  // "Todos" começa escolhido.
  await expect(grupo.getByRole("link", { name: "Todos" })).toHaveAttribute("aria-current", "true");
  await page.screenshot({ path: "/tmp/agenda-todos.png" });

  // Escolhe um profissional: a URL guarda a escolha e o anel passa para ele.
  await grupo.getByRole("link", { name: "Léo Alves" }).click();
  await expect(page).toHaveURL(/pro=/);
  await expect(grupo.getByRole("link", { name: "Léo Alves" })).toHaveAttribute("aria-current", "true");
  await expect(grupo.getByRole("link", { name: "Todos" })).not.toHaveAttribute("aria-current", "true");
  await page.screenshot({ path: "/tmp/agenda-leo.png" });

  // Tocar de novo no escolhido volta para Todos.
  await grupo.getByRole("link", { name: "Léo Alves" }).click();
  await expect(page).not.toHaveURL(/pro=/);
  await expect(grupo.getByRole("link", { name: "Todos" })).toHaveAttribute("aria-current", "true");

  // Quem está no fim da linha vem para a tela ao ser escolhido.
  await grupo.getByRole("link", { name: "Gil Santos" }).click();
  await expect(page).toHaveURL(/pro=/);
  const gil = grupo.getByRole("link", { name: "Gil Santos" });
  await expect(gil).toBeInViewport();
});
