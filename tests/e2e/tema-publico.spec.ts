import { expect, test, type Page } from "@playwright/test";
import { chooseService, open, randomIp, seedBooking, seedTenant } from "./helpers";

test.use({ extraHTTPHeaders: { "x-forwarded-for": randomIp() } });

/** Opacidade dos dois ícones do botão: [sol, lua]. */
async function opacidades(page: Page): Promise<[number, number]> {
  const botao = page.getByRole("button", { name: /^Mudar para o tema/ });
  return botao.evaluate((el) => {
    const [sol, lua] = [...el.querySelectorAll("svg")];
    return [Number(getComputedStyle(sol!).opacity), Number(getComputedStyle(lua!).opacity)] as [number, number];
  });
}

test.describe("página de agendamento: tema claro/escuro", () => {
  test("aparelho escuro: abre escuro com o sol; tocar vai para o claro com a lua e lembra a escolha", async ({ page, request }) => {
    const { slug } = await seedTenant(request, {});
    await page.emulateMedia({ colorScheme: "dark" });
    await open(page, `/${slug}`);

    const botao = page.getByRole("button", { name: "Mudar para o tema claro" });
    await expect(botao).toBeVisible();
    // Fica no canto superior direito, ao lado do nome do salão.
    const caixa = (await botao.boundingBox())!;
    const largura = page.viewportSize()!.width;
    expect(caixa.x + caixa.width).toBeGreaterThan(largura - 40);
    expect(caixa.y).toBeLessThan(160);
    expect(caixa.width).toBeGreaterThanOrEqual(44);
    // Escuro mostra o sol (some a lua).
    expect(await opacidades(page)).toEqual([1, 0]);
    const fundoEscuro = await page.evaluate(() => getComputedStyle(document.body).backgroundColor);

    // Há animação na troca de ícones.
    const duracao = await botao.locator("svg").first().evaluate((el) => getComputedStyle(el).transitionDuration);
    expect(parseFloat(duracao)).toBeGreaterThan(0);

    await botao.click();
    await expect(page.getByRole("button", { name: "Mudar para o tema escuro" })).toBeVisible();
    await expect.poll(() => opacidades(page)).toEqual([0, 1]); // claro mostra a lua
    await expect(page.locator("html")).toHaveClass(/light/);
    const fundoClaro = await page.evaluate(() => getComputedStyle(document.body).backgroundColor);
    expect(fundoClaro).not.toBe(fundoEscuro);

    // A escolha fica neste aparelho: recarregar continua no claro mesmo com o aparelho escuro.
    await open(page, `/${slug}`);
    await expect(page.locator("html")).toHaveClass(/light/);
    await expect(page.getByRole("button", { name: "Mudar para o tema escuro" })).toBeVisible();
    expect(await opacidades(page)).toEqual([0, 1]);

    // E dá para voltar ao escuro.
    await page.getByRole("button", { name: "Mudar para o tema escuro" }).click();
    await expect(page.getByRole("button", { name: "Mudar para o tema claro" })).toBeVisible();
    await expect.poll(() => opacidades(page)).toEqual([1, 0]);
  });

  test("aparelho claro: abre claro com a lua e o botão acompanha nos passos seguintes", async ({ page, request }) => {
    const { slug } = await seedTenant(request, {});
    await page.emulateMedia({ colorScheme: "light" });
    await open(page, `/${slug}`);
    await expect(page.getByRole("button", { name: "Mudar para o tema escuro" })).toBeVisible();
    expect(await opacidades(page)).toEqual([0, 1]);
    await page.screenshot({ path: "/tmp/tema-claro.png" });

    // Nos passos seguintes (cabeçalho compacto) o botão continua no canto direito.
    await chooseService(page, "Piercing hélix");
    await expect(page.getByRole("heading", { name: "Escolha o dia e o horário" })).toBeVisible();
    const botao = page.getByRole("button", { name: /^Mudar para o tema/ });
    await expect(botao).toBeVisible();
    await botao.click();
    await expect(page.locator("html")).toHaveClass(/dark/);
    await expect.poll(() => opacidades(page)).toEqual([1, 0]);
    await page.screenshot({ path: "/tmp/tema-escuro.png" });
  });

  test("link de gestão: segue o aparelho, tem o botão sol/lua e ignora o tema escolhido no painel", async ({ page, request }) => {
    const { slug } = await seedTenant(request);
    const { token } = await seedBooking(request, slug);

    // O dono deixou o painel escuro neste navegador; isso não vale para o link do cliente.
    await page.addInitScript(() => localStorage.setItem("eneven-tema", "dark"));
    await page.emulateMedia({ colorScheme: "light" });
    await open(page, `/agendamento/${token}`);
    await expect(page.getByRole("heading", { name: "Seu agendamento" })).toBeVisible();
    await expect(page.locator("html")).not.toHaveClass(/dark/);
    await expect(page.getByRole("button", { name: "Mudar para o tema escuro" })).toBeVisible();
    expect(await opacidades(page)).toEqual([0, 1]);

    // Aparelho escuro: abre escuro, com o sol.
    await page.emulateMedia({ colorScheme: "dark" });
    await open(page, `/agendamento/${token}`);
    await expect(page.getByRole("button", { name: "Mudar para o tema claro" })).toBeVisible();

    // Tocar troca para o claro e lembra só nas telas do cliente.
    await page.getByRole("button", { name: "Mudar para o tema claro" }).click();
    await expect(page.locator("html")).toHaveClass(/light/);
    expect(await page.evaluate(() => localStorage.getItem("eneven-tema-publico"))).toBe("light");
    expect(await page.evaluate(() => localStorage.getItem("eneven-tema"))).toBe("dark");
  });
});
