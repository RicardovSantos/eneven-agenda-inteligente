import { mkdtemp, readFile, rm, stat, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import sharp from "sharp";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { extractSymbol } from "../../scripts/brand/crop";
import { generateBrandAssets, type BrandConfig } from "../../scripts/brand/generate";

const config: BrandConfig = {
  symbolRegion: { left: 0.05, top: 0.1, width: 0.3, height: 0.8 },
  background: "#FFFFFF",
  canvas: "#F7F6FC",
  gradient: ["#3E07D2", "#9429F7", "#F581FB"],
};

/** Logo sintética: fundo branco, "símbolo" (retângulo + ponto redondo) dentro da região e uma barra de texto à direita. */
async function makeLogo(width: number, height: number): Promise<Buffer> {
  const r = config.symbolRegion;
  const x = Math.round(width * (r.left + 0.03));
  const y = Math.round(height * (r.top + 0.05));
  const w = Math.round(width * (r.width - 0.06));
  const h = Math.round(height * (r.height - 0.1));
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}">
    <rect width="${width}" height="${height}" fill="#FFFFFF"/>
    <rect x="${x}" y="${y}" width="${w}" height="${h}" fill="#3E07D2"/>
    <circle cx="${x + w * 0.5}" cy="${y + h * 0.5}" r="${Math.min(w, h) * 0.15}" fill="#F581FB"/>
    <rect x="${Math.round(width * 0.45)}" y="${Math.round(height * 0.4)}" width="${Math.round(width * 0.45)}" height="${Math.round(height * 0.2)}" fill="#29303C"/>
  </svg>`;
  return sharp(Buffer.from(svg)).png().toBuffer();
}

async function pixels(file: string | Buffer) {
  const { data, info } = await sharp(file).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  const at = (x: number, y: number) => {
    const i = (y * info.width + x) * 4;
    return { r: data[i], g: data[i + 1], b: data[i + 2], a: data[i + 3] };
  };
  /** caixa dos pixels que não são fundo (transparentes ou brancos) */
  const bbox = () => {
    let minX = info.width;
    let minY = info.height;
    let maxX = -1;
    let maxY = -1;
    for (let y = 0; y < info.height; y++) {
      for (let x = 0; x < info.width; x++) {
        const p = at(x, y);
        const isBg = p.a < 16 || (p.r > 240 && p.g > 240 && p.b > 240);
        if (!isBg) {
          minX = Math.min(minX, x);
          maxX = Math.max(maxX, x);
          minY = Math.min(minY, y);
          maxY = Math.max(maxY, y);
        }
      }
    }
    return { minX, minY, maxX, maxY, w: maxX - minX + 1, h: maxY - minY + 1 };
  };
  return { info, at, bbox };
}

const size = async (file: string) => {
  const m = await sharp(file).metadata();
  return { width: m.width, height: m.height };
};

describe("generateBrandAssets", () => {
  let dir: string;
  let wide: string; // 800x300
  let square: string; // 500x500
  let outWide: string;
  let outSquare: string;
  let wideFiles: string[];

  beforeAll(async () => {
    dir = await mkdtemp(join(tmpdir(), "brand-"));
    wide = join(dir, "logo-wide.png");
    square = join(dir, "logo-quadrada.png");
    await writeFile(wide, await makeLogo(800, 300));
    await writeFile(square, await makeLogo(500, 500));
    outWide = join(dir, "out-wide").replace(/\\/g, "/");
    outSquare = join(dir, "out-square").replace(/\\/g, "/");
    wideFiles = await generateBrandAssets({ logoPath: wide, outDir: outWide, config });
  });

  afterAll(async () => {
    await rm(dir, { recursive: true, force: true });
  });

  it("gera todos os ícones nos tamanhos certos", async () => {
    expect(await size(`${outWide}/icon-192.png`)).toEqual({ width: 192, height: 192 });
    expect(await size(`${outWide}/icon-512.png`)).toEqual({ width: 512, height: 512 });
    expect(await size(`${outWide}/icon-maskable-512.png`)).toEqual({ width: 512, height: 512 });
    expect(await size(`${outWide}/apple-touch-icon.png`)).toEqual({ width: 180, height: 180 });
    expect(await size(`${outWide}/icon-32.png`)).toEqual({ width: 32, height: 32 });
    expect(await size(`${outWide}/og-default.png`)).toEqual({ width: 1200, height: 630 });
    expect(wideFiles).toContain(`${outWide}/favicon.ico`);
    expect(wideFiles).toContain(`${outWide}/logo.png`);
  });

  it("favicon.ico traz 16, 32 e 48", async () => {
    const ico = await readFile(`${outWide}/favicon.ico`);
    expect(ico.readUInt16LE(2)).toBe(1); // tipo ícone
    expect(ico.readUInt16LE(4)).toBe(3);
    const widths = [0, 1, 2].map((i) => ico.readUInt8(6 + i * 16)).sort((a, b) => a - b);
    expect(widths).toEqual([16, 32, 48]);
  });

  it("extractSymbol recorta só o símbolo, sem borda branca", async () => {
    const symbol = await extractSymbol(await readFile(wide), config.symbolRegion);
    const m = await sharp(symbol).metadata();
    expect(m.hasAlpha).toBe(true);
    // retângulo do símbolo: largura 800*0.24=192, altura 300*0.7=210
    expect(m.width).toBe(192);
    expect(m.height).toBe(210);
    const p = await pixels(symbol);
    expect(p.at(0, 0).a).toBe(255);
    expect(p.at(m.width! - 1, m.height! - 1).a).toBe(255);
  });

  it("ícones opacos têm fundo branco e o símbolo ocupa ~72% do lado", async () => {
    for (const name of ["icon-192.png", "icon-512.png", "apple-touch-icon.png"]) {
      const p = await pixels(`${outWide}/${name}`);
      expect(p.at(2, 2)).toEqual({ r: 255, g: 255, b: 255, a: 255 });
      const box = p.bbox();
      const ratio = Math.max(box.w, box.h) / p.info.width;
      expect(ratio).toBeGreaterThan(0.69);
      expect(ratio).toBeLessThan(0.75);
      expect(Math.abs((box.minX + box.maxX) / 2 - p.info.width / 2)).toBeLessThan(2);
      expect(Math.abs((box.minY + box.maxY) / 2 - p.info.height / 2)).toBeLessThan(2);
    }
  });

  it("maskable tem margem de segurança: canto é cor de fundo e símbolo ≤ 60%", async () => {
    const p = await pixels(`${outWide}/icon-maskable-512.png`);
    expect(p.at(5, 5)).toEqual({ r: 255, g: 255, b: 255, a: 255 });
    const box = p.bbox();
    expect(Math.max(box.w, box.h)).toBeLessThanOrEqual(Math.round(512 * 0.6) + 1);
    expect(Math.abs((box.minX + box.maxX) / 2 - 256)).toBeLessThan(2);
    expect(Math.abs((box.minY + box.maxY) / 2 - 256)).toBeLessThan(2);
  });

  it("icon-32 é transparente, recortado e preenche ~92% do lado", async () => {
    const p = await pixels(`${outWide}/icon-32.png`);
    expect(p.at(0, 0).a).toBe(0);
    const box = p.bbox();
    expect(Math.max(box.w, box.h)).toBeGreaterThanOrEqual(28);
    expect(Math.max(box.w, box.h)).toBeLessThanOrEqual(31);
  });

  it("logo.png é a logo horizontal aparada, com o branco transparente", async () => {
    const p = await pixels(`${outWide}/logo.png`);
    expect(p.info.width).toBeGreaterThan(p.info.height);
    let leftOpaque = false;
    let nearWhiteOpaque = 0;
    for (let y = 0; y < p.info.height; y++) {
      if (p.at(0, y).a > 200) leftOpaque = true;
      for (let x = 0; x < p.info.width; x++) {
        const c = p.at(x, y);
        if (c.a > 20 && c.r > 245 && c.g > 245 && c.b > 245) nearWhiteOpaque++;
      }
    }
    expect(leftOpaque).toBe(true);
    expect(nearWhiteOpaque).toBe(0);
  });

  it("logo-email.png é a logo horizontal com 320 px de largura, transparente e leve", async () => {
    expect(wideFiles).toContain(`${outWide}/logo-email.png`);
    const m = await sharp(`${outWide}/logo-email.png`).metadata();
    expect(m.format).toBe("png");
    expect(m.width).toBe(320);
    const logo = await sharp(`${outWide}/logo.png`).metadata();
    expect(m.height).toBe(Math.round((320 * logo.height!) / logo.width!));
    expect(m.hasAlpha).toBe(true);
    const p = await pixels(`${outWide}/logo-email.png`);
    let transparent = 0;
    let opaque = 0;
    for (let y = 0; y < p.info.height; y++) {
      for (let x = 0; x < p.info.width; x++) {
        const a = p.at(x, y).a;
        if (a === 0) transparent++;
        if (a === 255) opaque++;
      }
    }
    expect(transparent).toBeGreaterThan(0); // fundo transparente (sem retângulo branco)
    expect(opaque).toBeGreaterThan(0);
  });

  it("logo-email.png da logo oficial tem 320 px e menos de 60 KB", async () => {
    const real = JSON.parse(await readFile("marca/marca.config.json", "utf8"));
    const out = join(dir, "out-real").replace(/\\/g, "/");
    await generateBrandAssets({ logoPath: "marca/logo.png", outDir: out, config: real });
    expect((await sharp(`${out}/logo-email.png`).metadata()).width).toBe(320);
    expect((await stat(`${out}/logo-email.png`)).size).toBeLessThan(60 * 1024);
  });

  it("logo-dark.png recolore o texto escuro para claro e mantém o degradê roxo", async () => {
    expect(wideFiles).toContain(`${outWide}/logo-dark.png`);
    const light = await pixels(`${outWide}/logo.png`);
    const dark = await pixels(`${outWide}/logo-dark.png`);
    expect(dark.info.width).toBe(light.info.width);
    expect(dark.info.height).toBe(light.info.height);

    // O texto (#29303C) é a barra à direita; o símbolo (#3E07D2) fica à esquerda.
    const textPixel = (p: Awaited<ReturnType<typeof pixels>>) => {
      for (let x = p.info.width - 1; x >= 0; x--) {
        const c = p.at(x, Math.floor(p.info.height / 2));
        if (c.a === 255) return { x, c };
      }
      throw new Error("sem pixel opaco");
    };
    const { x: textX, c: before } = textPixel(light);
    expect(before.r).toBeLessThan(60); // era escuro
    const after = dark.at(textX - 5, Math.floor(dark.info.height / 2));
    expect(after).toEqual({ r: 0xec, g: 0xea, b: 0xf5, a: 255 });

    // Roxo do símbolo intocado (mesmo pixel, mesma cor, mesmo alfa).
    const sx = 5;
    const sy = Math.floor(light.info.height * 0.15);
    expect(light.at(sx, sy)).toEqual({ r: 0x3e, g: 0x07, b: 0xd2, a: 255 });
    expect(dark.at(sx, sy)).toEqual(light.at(sx, sy));

    // Nenhum pixel opaco fica escuro e sem cor (sem texto "sumindo" no fundo escuro).
    let stillDark = 0;
    for (let y = 0; y < dark.info.height; y++) {
      for (let x = 0; x < dark.info.width; x++) {
        const c = dark.at(x, y);
        if (c.a > 200 && c.r < 90 && c.g < 90 && c.b < 90) stillDark++;
      }
    }
    expect(stillDark).toBe(0);

    // O alfa é preservado (fundo transparente continua transparente).
    expect(dark.at(0, 0).a).toBe(light.at(0, 0).a);
  });

  it("og-default tem o fundo canvas e a assinatura em degradê", async () => {
    const p = await pixels(`${outWide}/og-default.png`);
    expect(p.at(5, 5)).toEqual({ r: 247, g: 246, b: 252, a: 255 });
    // o fio é um degradê #3E07D2 -> #9429F7 -> #F581FB: o fim direito precisa ser rosado
    let pinkish = 0;
    for (let y = 400; y < p.info.height; y++) {
      for (let x = 600; x < p.info.width; x++) {
        const c = p.at(x, y);
        if (c.r > 220 && c.g < 180 && c.b > 230) pinkish++;
      }
    }
    expect(pinkish).toBeGreaterThan(20);
    // e o ponto #3E07D2 (14px) existe na região da assinatura, à esquerda do fio
    let dot = 0;
    for (let y = 400; y < p.info.height; y++) {
      for (let x = 400; x < 600; x++) {
        const c = p.at(x, y);
        if (Math.abs(c.r - 62) < 8 && Math.abs(c.g - 7) < 8 && Math.abs(c.b - 210) < 8) dot++;
      }
    }
    expect(dot).toBeGreaterThan(100);
  });

  it("não distorce nem quebra com logo quadrada", async () => {
    const files = await generateBrandAssets({ logoPath: square, outDir: outSquare, config });
    expect(files).toContain(`${outSquare}/icon-512.png`);
    expect(await size(`${outSquare}/icon-512.png`)).toEqual({ width: 512, height: 512 });
    expect(await size(`${outSquare}/og-default.png`)).toEqual({ width: 1200, height: 630 });
    const p = await pixels(`${outSquare}/icon-512.png`);
    const box = p.bbox();
    // retângulo do símbolo na logo 500x500: 120x350 (proporção preservada)
    expect(box.w / box.h).toBeCloseTo(120 / 350, 1);
  });
});
