import { expect, test } from "@playwright/test";
import { loginAs, open, seedTenant } from "./helpers";

test.describe("barra de navegação inferior (celular)", () => {
  test("botões grandes para o dedo, sem nada por cima, e toda aba responde ao toque", async ({ page, request }) => {
    const { slug } = await seedTenant(request, {});
    await loginAs(page, request, slug);
    await open(page, "/painel");
    // O botão "N" do `next dev` fica sobre a aba Agenda (só em desenvolvimento) e atrapalharia os toques.
    await page.addStyleTag({ content: "nextjs-portal { display: none !important; }" });

    const nav = page.getByRole("navigation", { name: "Principal" });
    const links = nav.getByRole("link");
    await expect(links).toHaveCount(4);

    // Cada botão tem pelo menos 64 px de altura (o mínimo confortável é 44 px).
    for (const link of await links.all()) {
      const box = (await link.boundingBox())!;
      expect(box.height).toBeGreaterThanOrEqual(64);
      expect(box.width).toBeGreaterThanOrEqual(80);
    }

    // Nada cobre a área de toque: em vários pontos de cada botão o elemento tocado é o próprio link.
    const cobertos = await nav.evaluate((el) => {
      const falhas: string[] = [];
      for (const a of el.querySelectorAll("a")) {
        const r = a.getBoundingClientRect();
        for (const [fx, fy] of [[0.1, 0.15], [0.5, 0.5], [0.9, 0.85], [0.1, 0.85], [0.9, 0.15]]) {
          const hit = document.elementFromPoint(r.left + r.width * fx, r.top + r.height * fy);
          if (!hit || !a.contains(hit)) falhas.push(`${a.textContent} (${fx},${fy})`);
        }
      }
      return falhas;
    });
    expect(cobertos).toEqual([]);

    // Toque em cada aba: vai para a página e a aba fica marcada.
    for (const [nome, url] of [["Clientes", /\/painel\/clientes$/], ["Painel", /\/painel\/visao-geral$/], ["Mais", /\/painel\/mais$/], ["Agenda", /\/painel$/]] as const) {
      await nav.getByRole("link", { name: nome }).tap();
      await expect(page).toHaveURL(url);
      await expect(nav.getByRole("link", { name: nome })).toHaveAttribute("aria-current", "page");
    }

    // Toques rápidos e seguidos em abas diferentes: ganha o último, sem travar.
    await nav.getByRole("link", { name: "Clientes" }).tap();
    await nav.getByRole("link", { name: "Painel" }).tap();
    await nav.getByRole("link", { name: "Mais" }).tap();
    await expect(page).toHaveURL(/\/painel\/mais$/);
    await expect(nav.getByRole("link", { name: "Mais" })).toHaveAttribute("aria-current", "page");
    await page.screenshot({ path: "/tmp/barra-inferior.png" });
  });
});
