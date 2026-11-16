import { expect, test } from "@playwright/test";
import { open, seedTenant } from "./helpers";

test("agendamento: cada nome da barra de progresso fica centralizado embaixo do seu ponto", async ({ page, request }) => {
  const { slug } = await seedTenant(request, {});
  await open(page, `/${slug}`);
  const fio = page.getByRole("list", { name: "Etapas do agendamento" });
  await expect(fio).toBeVisible();

  const medidas = await fio.evaluate((ol) =>
    [...ol.querySelectorAll("li")].map((li) => {
      const [linhaPonto, nome] = [li.children[0] as HTMLElement, li.children[1] as HTMLElement];
      const ponto = linhaPonto.lastElementChild as HTMLElement; // o círculo (a linha, se houver, vem antes)
      const centro = (el: HTMLElement) => {
        const r = el.getBoundingClientRect();
        return r.left + r.width / 2;
      };
      return { texto: nome.textContent?.trim(), ponto: centro(ponto), nome: centro(nome), largura: nome.getBoundingClientRect().width };
    }),
  );
  expect(medidas.map((m) => m.texto)).toEqual(["Serviço", "Profissional", "Horário", "Seus dados"]);
  for (const m of medidas) expect(Math.abs(m.ponto - m.nome), `${m.texto}: ponto ${m.ponto}, nome ${m.nome}`).toBeLessThan(1);

  // Pontos igualmente espaçados (colunas iguais) e nenhum nome estoura a tela.
  const passos = medidas.slice(1).map((m, i) => m.ponto - medidas[i]!.ponto);
  for (const passo of passos) expect(Math.abs(passo - passos[0]!)).toBeLessThan(1);
  const largura = page.viewportSize()!.width;
  for (const m of medidas) {
    expect(m.ponto - m.largura / 2).toBeGreaterThanOrEqual(0);
    expect(m.ponto + m.largura / 2).toBeLessThanOrEqual(largura);
  }
  await fio.scrollIntoViewIfNeeded();
  await page.screenshot({ path: "/tmp/progresso.png" });
});
