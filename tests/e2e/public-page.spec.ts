import sharp from "sharp";
import { expect, test } from "@playwright/test";
import { chooseFirstSlot, loginAs, open, randomIp, seedTenant } from "./helpers";

// IP próprio deste arquivo: o limite de reservas por IP vale no servidor de desenvolvimento.
test.use({ extraHTTPHeaders: { "x-forwarded-for": randomIp() } });

/** Imagem que NÃO é WebP (JPEG de 1800x1200), para provar a conversão automática. */
const photo = (color: string) =>
  sharp({ create: { width: 1800, height: 1200, channels: 3, background: color } }).jpeg().toBuffer();

test.describe("página pública com fotos, equipe e informações", () => {
  test("a dona envia as fotos, a página mostra tudo e o profissional abre a agenda dele", async ({
    page,
    request,
  }) => {
    const { slug } = await seedTenant(request, {
      extraProfessionals: ["Léo"],
      address: "Rua Jorge Augusto, 409, apto 13",
    });

    // Painel: configurações (imagens do carrossel, Facebook e Instagram).
    await loginAs(page, request, slug);
    await open(page, "/painel/configuracoes");

    await page.getByLabel("Facebook (opcional)").fill("https://facebook.com/studio.defendi");
    await page.getByLabel("Instagram (opcional)").fill("@studio.defendi");
    await page.locator('section[aria-labelledby="info-title"]').getByRole("button", { name: "Salvar" }).click();
    await expect(page.getByText("Alterações salvas")).toBeVisible();

    const hero = page.locator('section[aria-labelledby="public-page-title"]');
    for (const [index, color] of ["#336699", "#993366"].entries()) {
      await hero.getByLabel(`Imagem ${index + 1}`).setInputFiles({
        name: `ambiente-${index}.jpg`,
        mimeType: "image/jpeg",
        buffer: await photo(color),
      });
      await expect(page.getByText("Imagem atualizada").last()).toBeVisible();
    }
    await hero.getByLabel("Título sobre as imagens (opcional)").fill("Bem-vinda ao estúdio");
    await hero.getByRole("button", { name: "Salvar" }).click();

    // O que ficou guardado é WebP (convertido), servido pelo endereço público.
    const stored = await request.get(`/api/midia/${slug}/capa/0`);
    expect(stored.status()).toBe(200);
    expect(stored.headers()["content-type"]).toBe("image/webp");
    expect((await sharp(await stored.body()).metadata()).format).toBe("webp");
    expect((await request.get(`/api/midia/${slug}/capa/2`)).status()).toBe(404);

    // Painel: equipe (cargo e foto do Léo).
    await open(page, "/painel/equipe");
    await page.getByRole("button", { name: /Léo/ }).first().click();
    await page.getByLabel("Cargo (opcional)").fill("Barbeiro");
    await page.getByLabel("Foto", { exact: true }).setInputFiles({
      name: "leo.png",
      mimeType: "image/png",
      buffer: await sharp({ create: { width: 700, height: 700, channels: 3, background: "#228855" } }).png().toBuffer(),
    });
    await expect(page.getByText("Foto atualizada").last()).toBeVisible();
    await page.getByRole("button", { name: "Salvar" }).last().click();
    await expect(page.getByText("Profissional salvo")).toBeVisible();

    // Página pública.
    await page.context().clearCookies();
    await open(page, `/${slug}`);
    await expect(page.getByRole("heading", { name: "Bem-vinda ao estúdio" })).toBeVisible();
    await expect(page.getByRole("region", { name: "Fotos do estabelecimento" })).toBeVisible();
    await expect(page.getByRole("button", { name: "Ver imagem 2" })).toBeVisible();
    await expect(page.getByRole("heading", { name: "Nossa equipe" })).toBeVisible();
    await expect(page.getByText("Barbeiro")).toBeVisible();
    await expect(page.getByRole("heading", { name: "Informações do estúdio" })).toBeVisible();
    await expect(page.getByText("Rua Jorge Augusto, 409, apto 13", { exact: true }).first()).toBeVisible();
    await expect(page.getByText("Segunda a sexta")).toBeVisible();
    await expect(page.getByRole("link", { name: "Instagram" })).toHaveAttribute(
      "href",
      "https://instagram.com/studio.defendi",
    );
    await expect(page.getByRole("link", { name: "Facebook" })).toHaveAttribute(
      "href",
      "https://facebook.com/studio.defendi",
    );
    // As fotos carregam sem barra de progresso (ela só existe no envio).
    await expect(page.getByRole("progressbar")).toHaveCount(0);
    await page.screenshot({ path: "test-results/public-page-home.png", fullPage: true });

    // Ver no mapa: escolha entre os três aplicativos.
    await page.getByRole("button", { name: "Ver no mapa" }).click();
    const dialog = page.getByRole("dialog", { name: "Abrir no mapa" });
    await expect(dialog.getByRole("link", { name: "Waze" })).toHaveAttribute("href", /waze\.com\/ul\?q=/);
    await expect(dialog.getByRole("link", { name: "Google Maps" })).toHaveAttribute("href", /google\.com\/maps/);
    await expect(dialog.getByRole("link", { name: "Mapas da Apple" })).toHaveAttribute("href", /maps\.apple\.com/);
    await page.screenshot({ path: "test-results/public-page-map.png" });
    await dialog.getByRole("button", { name: "Fechar" }).click();

    // Clicar no profissional abre a agenda dele, direto nos serviços.
    await page.getByRole("link", { name: /Léo/ }).click();
    await expect(page).toHaveURL(new RegExp(`/${slug}/profissional/[0-9a-f-]{36}$`));
    await expect(page.getByText("Agendando com")).toBeVisible();
    await expect(page.getByRole("heading", { name: "Serviços de Léo" })).toBeVisible();
    await page.screenshot({ path: "test-results/public-page-pro.png", fullPage: true });

    // Serviço e, em seguida, a data: o passo do profissional é pulado.
    await page.getByLabel("Piercing hélix").check();
    await page.getByRole("button", { name: "Continuar" }).click();
    await expect(page.getByRole("heading", { name: "Escolha o dia e o horário" })).toBeVisible();
    await expect(page.getByText("com Léo")).toBeVisible();
    await chooseFirstSlot(page);
  });

  test("profissional novo: a foto escolhida antes de salvar é enviada junto", async ({ page, request }) => {
    const { slug } = await seedTenant(request, { extraProfessionals: [] });
    await loginAs(page, request, slug);
    await open(page, "/painel/equipe");
    await page.getByRole("button", { name: "Novo profissional" }).first().click();
    await page.getByLabel("Nome", { exact: true }).fill("Duda");
    await page.getByLabel("Cargo (opcional)").fill("Manicure");
    await page.getByLabel("Foto", { exact: true }).setInputFiles({
      name: "duda.png",
      mimeType: "image/png",
      buffer: await sharp({ create: { width: 500, height: 800, channels: 4, background: "#aa5522" } }).png().toBuffer(),
    });
    await page.getByRole("button", { name: "Salvar" }).last().click();
    await expect(page.getByText("Profissional salvo")).toBeVisible();

    await page.context().clearCookies();
    await open(page, `/${slug}`);
    const card = page.getByRole("link", { name: /Duda/ });
    await expect(card).toContainText("Manicure");
    const href = await card.getAttribute("href");
    const id = href!.split("/").pop();
    const stored = await request.get(`/api/midia/${slug}/profissional/${id}`);
    expect(stored.status()).toBe(200);
    expect(stored.headers()["content-type"]).toBe("image/webp");
    const meta = await sharp(await stored.body()).metadata();
    expect([meta.format, meta.width, meta.height]).toEqual(["webp", 480, 480]);
  });

  test("profissional que não existe volta ao 404 do estabelecimento", async ({ page, request }) => {
    const { slug } = await seedTenant(request);
    const response = await page.goto(`/${slug}/profissional/00000000-0000-4000-8000-000000000000`);
    expect(response?.status()).toBe(404);
  });
});

test.describe("categorias de serviços", () => {
  test("a dona cria categorias no painel e a página mostra os grupos que abrem e fecham", async ({
    page,
    request,
  }) => {
    const { slug } = await seedTenant(request);
    await loginAs(page, request, slug);
    await open(page, "/painel/servicos");

    for (const [name, category] of [
      ["Corte feminino", "Cabelo e tratamentos"],
      ["Maquiagem social", "Maquiagens"],
    ]) {
      await page.getByRole("button", { name: "Novo serviço" }).first().click();
      await page.getByLabel("Nome", { exact: true }).fill(name);
      await page.getByLabel("Categoria").fill(category);
      await page.getByRole("button", { name: "Salvar" }).last().click();
      await expect(page.getByText("Serviço salvo")).toBeVisible();
    }

    await page.context().clearCookies();
    await open(page, `/${slug}`);

    // O primeiro grupo vem aberto; o segundo abre no toque e o selecionado é contado no cabeçalho.
    const cabelo = page.getByRole("button", { name: /Cabelo e tratamentos/ });
    const make = page.getByRole("button", { name: /Maquiagens/ });
    await expect(cabelo).toHaveAttribute("aria-expanded", "true");
    await expect(page.getByLabel("Corte feminino")).toBeVisible();
    await expect(make).toHaveAttribute("aria-expanded", "false");
    await expect(page.getByLabel("Maquiagem social")).toHaveCount(0);
    await expect(page.getByRole("button", { name: /Outros serviços/ })).toBeVisible();

    await make.click();
    await page.getByLabel("Maquiagem social").check();
    await make.click();
    await expect(page.getByLabel("Maquiagem social")).toHaveCount(0);
    await expect(make).toContainText("1");
    await page.screenshot({ path: "test-results/public-page-categories.png", fullPage: true });

    // A busca abre todos os grupos com resultado e a seleção continua.
    await page.getByLabel("Pesquisar serviço").fill("maquiagem");
    await expect(page.getByLabel("Maquiagem social")).toBeChecked();
    await expect(page.getByLabel("Corte feminino")).toHaveCount(0);
  });
});
