import { mkdir, readFile, writeFile } from "node:fs/promises";
import pngToIco from "png-to-ico";
import sharp from "sharp";
import { z } from "zod";
import { extractLogo, extractSymbol, hasVisiblePixels, lightenDarkText } from "./crop";

const fraction = z.number().min(0).max(1);
const hexColor = z.string().regex(/^#[0-9a-fA-F]{6}$/, "use uma cor no formato #RRGGBB");

/** Formato de `marca/marca.config.json`. */
export const brandConfigSchema = z.object({
  /** Região do símbolo (o "E" com o ponto) em frações (0-1) da logo horizontal. */
  symbolRegion: z.object({
    left: fraction,
    top: fraction,
    width: fraction.refine((n) => n > 0, "precisa ser maior que 0"),
    height: fraction.refine((n) => n > 0, "precisa ser maior que 0"),
  }),
  /** Fundo dos ícones opacos. */
  background: hexColor,
  /** Fundo da imagem de compartilhamento (OG). */
  canvas: hexColor,
  /** Degradê da marca, da esquerda para a direita. */
  gradient: z.tuple([hexColor, hexColor, hexColor]),
});

export type BrandConfig = z.infer<typeof brandConfigSchema>;

export const EMPTY_SYMBOL_MESSAGE =
  "A região do símbolo em marca/marca.config.json não contém a logo — ajuste symbolRegion";

export type GenerateOptions = {
  logoPath: string;
  outDir: string;
  config: BrandConfig;
};

/** Proporção do lado ocupada pelo símbolo em cada tipo de ícone. */
const OPAQUE_ICON_FILL = 0.72;
const MASKABLE_FILL = 0.6;
const TRANSPARENT_ICON_FILL = 0.92;

const OG = { width: 1200, height: 630, logoWidth: 760, logoMaxHeight: 300, logoLift: 40 };
/** "Fio do tempo": linha 4px x 360px com um ponto de 14px no início, 48px abaixo da logo. */
const THREAD = { width: 360, height: 4, dot: 14, gap: 48 };

const TRANSPARENT = { r: 0, g: 0, b: 0, alpha: 0 };

/** Centraliza o símbolo (mantendo a proporção) dentro de um quadrado `side`, ocupando `fill` do lado. */
async function squareIcon(
  symbol: Buffer,
  side: number,
  fill: number,
  background?: string,
): Promise<Buffer> {
  const box = Math.max(1, Math.round(side * fill));
  const inner = await sharp(symbol)
    .resize({ width: box, height: box, fit: "inside" })
    .png()
    .toBuffer();
  const { width = box, height = box } = await sharp(inner).metadata();
  return sharp({
    create: { width: side, height: side, channels: 4, background: background ?? TRANSPARENT },
  })
    .composite([
      { input: inner, left: Math.round((side - width) / 2), top: Math.round((side - height) / 2) },
    ])
    .png()
    .toBuffer();
}

function threadSvg(gradient: BrandConfig["gradient"]): Buffer {
  const { width, height, dot } = THREAD;
  const cy = dot / 2;
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${dot}" viewBox="0 0 ${width} ${dot}">
  <defs>
    <linearGradient id="g" x1="0" y1="0" x2="${width}" y2="0" gradientUnits="userSpaceOnUse">
      <stop offset="0" stop-color="${gradient[0]}"/>
      <stop offset="0.5" stop-color="${gradient[1]}"/>
      <stop offset="1" stop-color="${gradient[2]}"/>
    </linearGradient>
  </defs>
  <rect x="0" y="${cy - height / 2}" width="${width}" height="${height}" rx="${height / 2}" fill="url(#g)"/>
  <circle cx="${dot / 2}" cy="${cy}" r="${dot / 2}" fill="${gradient[0]}"/>
</svg>`;
  return Buffer.from(svg);
}

async function ogImage(logo: Buffer, config: BrandConfig): Promise<Buffer> {
  const resized = await sharp(logo)
    .resize({ width: OG.logoWidth, height: OG.logoMaxHeight, fit: "inside" })
    .png()
    .toBuffer();
  const { width: lw = OG.logoWidth, height: lh = 0 } = await sharp(resized).metadata();

  // Bloco (logo + fio) centralizado na vertical, com a logo um pouco acima do centro.
  const logoTop = Math.max(0, Math.round((OG.height - lh) / 2) - OG.logoLift);
  const threadCenterY = logoTop + lh + THREAD.gap;
  const threadTop = Math.min(OG.height - THREAD.dot, threadCenterY - THREAD.dot / 2);

  return sharp({
    create: { width: OG.width, height: OG.height, channels: 4, background: config.canvas },
  })
    .composite([
      { input: resized, left: Math.round((OG.width - lw) / 2), top: logoTop },
      {
        input: threadSvg(config.gradient),
        left: Math.round((OG.width - THREAD.width) / 2),
        top: Math.round(threadTop),
      },
    ])
    .png()
    .toBuffer();
}

/** Gera todos os ícones e imagens de compartilhamento a partir da logo. Devolve os caminhos gerados. */
export async function generateBrandAssets({
  logoPath,
  outDir,
  config,
}: GenerateOptions): Promise<string[]> {
  const dir = outDir.replace(/[\\/]+$/, "");
  await mkdir(dir, { recursive: true });

  const source = await readFile(logoPath);
  const symbol = await extractSymbol(source, config.symbolRegion);
  if (!(await hasVisiblePixels(symbol))) throw new Error(EMPTY_SYMBOL_MESSAGE);
  const logo = await extractLogo(source);

  const outputs: Array<[name: string, data: Buffer]> = [
    ["icon-192.png", await squareIcon(symbol, 192, OPAQUE_ICON_FILL, config.background)],
    ["icon-512.png", await squareIcon(symbol, 512, OPAQUE_ICON_FILL, config.background)],
    ["icon-maskable-512.png", await squareIcon(symbol, 512, MASKABLE_FILL, config.background)],
    ["apple-touch-icon.png", await squareIcon(symbol, 180, OPAQUE_ICON_FILL, config.background)],
    ["icon-32.png", await squareIcon(symbol, 32, TRANSPARENT_ICON_FILL)],
    [
      "favicon.ico",
      await pngToIco(
        await Promise.all(
          [16, 32, 48].map((side) => squareIcon(symbol, side, TRANSPARENT_ICON_FILL)),
        ),
      ),
    ],
    ["logo.png", logo],
    ["logo-dark.png", await lightenDarkText(logo)],
    ["og-default.png", await ogImage(logo, config)],
  ];

  const files: string[] = [];
  for (const [name, data] of outputs) {
    const path = `${dir}/${name}`;
    await writeFile(path, data);
    files.push(path);
  }
  return files;
}
