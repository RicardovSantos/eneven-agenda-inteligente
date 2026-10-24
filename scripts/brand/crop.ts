import sharp, { type Sharp } from "sharp";

/** Região em frações (0–1) da imagem. */
export type Region = { left: number; top: number; width: number; height: number };

type Rgba = { data: Buffer; width: number; height: number };

/** Pixels com todos os canais >= WHITE_MAX viram transparentes; de SOFT_MIN a WHITE_MAX a transparência é gradual. */
const WHITE_MAX = 245;
const SOFT_MIN = 230;
/** Alfa mínimo para um pixel contar como conteúdo ao aparar. */
const TRIM_ALPHA = 8;

async function toRgba(input: Buffer): Promise<Rgba> {
  const { data, info } = await sharp(input)
    .toColourspace("srgb")
    .ensureAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true });
  return { data, width: info.width, height: info.height };
}

function fromRgba({ data, width, height }: Rgba): Sharp {
  return sharp(data, { raw: { width, height, channels: 4 } });
}

/** Converte quase-branco em transparente, suavizando as bordas (sem halo branco). */
export async function whiteToTransparent(input: Buffer): Promise<Buffer> {
  const img = await toRgba(input);
  const { data } = img;
  for (let i = 0; i < data.length; i += 4) {
    const lightest = Math.min(data[i], data[i + 1], data[i + 2]);
    if (lightest >= WHITE_MAX) {
      data[i + 3] = 0;
    } else if (lightest > SOFT_MIN) {
      const ramp = (WHITE_MAX - lightest) / (WHITE_MAX - SOFT_MIN);
      data[i + 3] = Math.round(data[i + 3] * ramp);
    }
  }
  return fromRgba(img).png().toBuffer();
}

/** Apara as bordas transparentes (alfa baixo). Imagem totalmente transparente é devolvida como está. */
export async function trimTransparent(input: Buffer): Promise<Buffer> {
  const img = await toRgba(input);
  const { data, width, height } = img;
  let minX = width;
  let minY = height;
  let maxX = -1;
  let maxY = -1;
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      if (data[(y * width + x) * 4 + 3] > TRIM_ALPHA) {
        if (x < minX) minX = x;
        if (x > maxX) maxX = x;
        if (y < minY) minY = y;
        if (y > maxY) maxY = y;
      }
    }
  }
  if (maxX < 0) return fromRgba(img).png().toBuffer();
  return fromRgba(img)
    .extract({ left: minX, top: minY, width: maxX - minX + 1, height: maxY - minY + 1 })
    .png()
    .toBuffer();
}

/** `true` se a imagem tem ao menos um pixel visível (alfa acima do limite de aparar). */
export async function hasVisiblePixels(input: Buffer): Promise<boolean> {
  const { data } = await toRgba(input);
  for (let i = 3; i < data.length; i += 4) {
    if (data[i] > TRIM_ALPHA) return true;
  }
  return false;
}

/** Logo horizontal completa: quase-branco vira transparente e as bordas vazias são aparadas. */
export async function extractLogo(input: Buffer): Promise<Buffer> {
  return trimTransparent(await whiteToTransparent(input));
}

/** Recorta a região (frações) da logo e devolve só o símbolo, aparado e com fundo transparente. */
export async function extractSymbol(input: Buffer, region: Region): Promise<Buffer> {
  const { width, height } = await sharp(input).metadata();
  if (!width || !height) throw new Error("Logo inválida: não foi possível ler as dimensões.");

  const left = Math.max(0, Math.min(width - 1, Math.round(region.left * width)));
  const top = Math.max(0, Math.min(height - 1, Math.round(region.top * height)));
  const w = Math.max(1, Math.min(width - left, Math.round(region.width * width)));
  const h = Math.max(1, Math.min(height - top, Math.round(region.height * height)));

  const cropped = await sharp(input).extract({ left, top, width: w, height: h }).png().toBuffer();
  return trimTransparent(await whiteToTransparent(cropped));
}

/** Cor do texto da logo no tema escuro (`--ink` escuro). */
const DARK_TEXT_REPLACEMENT = { r: 0xec, g: 0xea, b: 0xf5 };
/** Saturação (HSL) abaixo da qual um pixel conta como "cinza" (o texto #29303C tem ~0,19). */
const GRAY_SATURATION_MAX = 0.3;
/** Abaixo desta luminância o pixel cinza é texto escuro e vira claro por inteiro. */
const DARK_LUMINANCE_MAX = 0.35;
/** Dos 35% a 92% de luminância (borda suavizada do texto) o alfa cai até sumir, sem deixar halo cinza. */
const FADE_LUMINANCE_END = 0.92;

/**
 * Versão da logo para o tema escuro: o texto escuro (cinza de baixa saturação
 * e luminância < 35%) é recolorido para `#ECEAF5`, preservando o alfa. A borda
 * suavizada do texto vira transparência em vez de cinza. O símbolo e o
 * degradê roxo/rosa ficam intactos.
 */
export async function lightenDarkText(input: Buffer): Promise<Buffer> {
  const img = await toRgba(input);
  const { data } = img;
  for (let i = 0; i < data.length; i += 4) {
    const r = data[i];
    const g = data[i + 1];
    const b = data[i + 2];
    const max = Math.max(r, g, b);
    const min = Math.min(r, g, b);
    const sum = max + min;
    if (sum === 0 || sum === 510) continue;
    const saturation = (max - min) / (sum <= 255 ? sum : 510 - sum);
    if (saturation >= GRAY_SATURATION_MAX) continue;

    const luminance = (0.299 * r + 0.587 * g + 0.114 * b) / 255;
    if (luminance >= FADE_LUMINANCE_END) continue;

    data[i] = DARK_TEXT_REPLACEMENT.r;
    data[i + 1] = DARK_TEXT_REPLACEMENT.g;
    data[i + 2] = DARK_TEXT_REPLACEMENT.b;
    if (luminance >= DARK_LUMINANCE_MAX) {
      const keep =
        (FADE_LUMINANCE_END - luminance) / (FADE_LUMINANCE_END - DARK_LUMINANCE_MAX);
      data[i + 3] = Math.round(data[i + 3] * keep);
    }
  }
  return fromRgba(img).png().toBuffer();
}
