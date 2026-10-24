import { mkdir, mkdtemp, readFile, rm, stat, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import sharp from "sharp";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { generateBrandAssets } from "../../scripts/brand/generate";
import { parseBrandConfig, runBrand } from "../../scripts/brand/run";

const config = {
  symbolRegion: { left: 0.05, top: 0.1, width: 0.3, height: 0.8 },
  background: "#FFFFFF",
  canvas: "#F7F6FC",
  gradient: ["#3E07D2", "#9429F7", "#F581FB"],
};

/** Logo sintética: fundo branco com um quadrado roxo (símbolo) e uma barra de texto. */
async function makeLogo(): Promise<Buffer> {
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="1000" height="300">
    <rect width="1000" height="300" fill="#FFFFFF"/>
    <rect x="80" y="50" width="200" height="200" fill="#3E07D2"/>
    <rect x="450" y="120" width="450" height="60" fill="#29303C"/>
  </svg>`;
  return sharp(Buffer.from(svg)).png().toBuffer();
}

describe("script de marca", () => {
  let root: string;

  beforeEach(async () => {
    root = await mkdtemp(join(tmpdir(), "marca-"));
    await mkdir(join(root, "marca"));
  });

  afterEach(async () => {
    await rm(root, { recursive: true, force: true });
  });

  const writeConfig = (value: unknown) =>
    writeFile(join(root, "marca/marca.config.json"), typeof value === "string" ? value : JSON.stringify(value));
  const writeLogo = async () => writeFile(join(root, "marca/logo.png"), await makeLogo());

  it("gera os arquivos em public/brand a partir de marca/", async () => {
    await writeConfig(config);
    await writeLogo();

    const files = await runBrand(root);

    expect(files.length).toBeGreaterThanOrEqual(9);
    expect((await stat(join(root, "public/brand/logo.png"))).size).toBeGreaterThan(0);
  });

  it("sem marca/logo.png: erro claro", async () => {
    await writeConfig(config);
    await expect(runBrand(root)).rejects.toThrow(/marca\/logo\.png não encontrado/);
  });

  it("sem marca/marca.config.json: erro claro", async () => {
    await writeLogo();
    await expect(runBrand(root)).rejects.toThrow(/marca\/marca\.config\.json não encontrado/);
  });

  it("config que não é JSON: erro claro", async () => {
    await writeLogo();
    await writeConfig("{ isso nao e json");
    await expect(runBrand(root)).rejects.toThrow(/marca\.config\.json não é um JSON válido/);
  });

  it("config fora do formato: erro aponta o campo", async () => {
    await writeLogo();
    await writeConfig({ ...config, symbolRegion: { ...config.symbolRegion, left: 2 } });
    await expect(runBrand(root)).rejects.toThrow(/symbolRegion\.left/);
  });

  it.each([
    ["sem gradiente", { ...config, gradient: undefined }, /gradient/],
    ["gradiente com 2 cores", { ...config, gradient: ["#000000", "#ffffff"] }, /gradient/],
    ["cor que não é hexadecimal", { ...config, canvas: "roxo" }, /canvas/],
    ["região sem largura", { ...config, symbolRegion: { ...config.symbolRegion, width: 0 } }, /symbolRegion\.width/],
  ])("parseBrandConfig recusa %s", (_name, value, pattern) => {
    expect(() => parseBrandConfig(value)).toThrow(pattern);
  });

  it("parseBrandConfig aceita a config do projeto", async () => {
    const real = JSON.parse(await readFile("marca/marca.config.json", "utf8"));
    expect(parseBrandConfig(real)).toMatchObject({ background: "#FFFFFF" });
  });

  it("região do símbolo sem conteúdo (só fundo): erro pedindo para ajustar symbolRegion", async () => {
    await writeLogo();
    await writeConfig({
      ...config,
      // canto inferior direito da imagem: só branco
      symbolRegion: { left: 0.92, top: 0.85, width: 0.07, height: 0.1 },
    });
    await expect(runBrand(root)).rejects.toThrow(
      "A região do símbolo em marca/marca.config.json não contém a logo — ajuste symbolRegion",
    );
  });

  it("generateBrandAssets também recusa região vazia (não grava nada)", async () => {
    const logoPath = join(root, "marca/logo.png");
    await writeFile(logoPath, await makeLogo());
    await expect(
      generateBrandAssets({
        logoPath,
        outDir: join(root, "out"),
        config: {
          ...config,
          symbolRegion: { left: 0.92, top: 0.85, width: 0.07, height: 0.1 },
          gradient: ["#3E07D2", "#9429F7", "#F581FB"],
        },
      }),
    ).rejects.toThrow(/ajuste symbolRegion/);
    await expect(stat(join(root, "out/logo.png"))).rejects.toThrow();
  });

  it("o arquivo de entrada é scripts/brand/cli.ts (generate.ts só exporta)", async () => {
    const pkg = JSON.parse(await readFile("package.json", "utf8"));
    expect(pkg.scripts.brand).toBe("tsx scripts/brand/cli.ts");
    const generate = await readFile("scripts/brand/generate.ts", "utf8");
    expect(generate).not.toMatch(/import\.meta\.url/);
    expect(generate).not.toMatch(/process\.argv/);
  });
});
