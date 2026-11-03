import { expect, test } from "@playwright/test";

test("telas de entrada no celular não rolam soltas", async ({ page }) => {
  for (const path of ["/entrar", "/recuperar-senha"]) {
    await page.goto(path);
    await expect(page.getByRole("main")).toBeVisible();
    const medidas = await page.evaluate(() => ({
      pagina: document.documentElement.scrollHeight,
      janela: window.innerHeight,
    }));
    expect(medidas.pagina, `${path}: a página não pode ser mais alta que a tela`).toBeLessThanOrEqual(medidas.janela);
  }
});

test("celular baixo: o formulário continua alcançável por rolagem interna", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 360 });
  await page.goto("/cadastro");
  const botao = page.getByRole("button", { name: /criar/i }).first();
  await botao.scrollIntoViewIfNeeded();
  await expect(botao).toBeInViewport();
});
