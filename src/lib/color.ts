/**
 * Cor da marca: validação e ajuste de leitura. Funções puras, usadas no
 * servidor (ao salvar) e no cliente (prévia ao vivo). Sem imports de servidor.
 */

const HEX = /^#([0-9a-f]{3}|[0-9a-f]{6})$/i;
const MIN_CONTRAST = 4.5;

export function isHexColor(value: string): boolean {
  return HEX.test(value);
}

/** `#abc` ou `#aabbcc` -> `#AABBCC`. Lança erro se não for hex. */
export function normalizeHex(value: string): string {
  if (!HEX.test(value)) throw new Error(`Cor inválida: ${value}`);
  let digits = value.slice(1).toUpperCase();
  if (digits.length === 3) digits = [...digits].map((c) => c + c).join("");
  return `#${digits}`;
}

function toRgb(hex: string): [number, number, number] {
  const h = normalizeHex(hex);
  return [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16)) as [
    number,
    number,
    number,
  ];
}

function luminance(hex: string): number {
  const [r, g, b] = toRgb(hex).map((v) => {
    const c = v / 255;
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

/** Razão de contraste WCAG entre a cor e o branco (1 a 21). */
export function contrastWithWhite(hex: string): number {
  return 1.05 / (luminance(hex) + 0.05);
}

function rgbToHsl([r, g, b]: [number, number, number]): [number, number, number] {
  const rn = r / 255;
  const gn = g / 255;
  const bn = b / 255;
  const max = Math.max(rn, gn, bn);
  const min = Math.min(rn, gn, bn);
  const l = (max + min) / 2;
  const d = max - min;
  if (d === 0) return [0, 0, l * 100];
  const s = d / (1 - Math.abs(2 * l - 1));
  let h: number;
  if (max === rn) h = ((gn - bn) / d) % 6;
  else if (max === gn) h = (bn - rn) / d + 2;
  else h = (rn - gn) / d + 4;
  return [(h * 60 + 360) % 360, s * 100, l * 100];
}

function hslToHex(h: number, s: number, l: number): string {
  const sn = s / 100;
  const ln = l / 100;
  const k = (n: number) => (n + h / 30) % 12;
  const a = sn * Math.min(ln, 1 - ln);
  const f = (n: number) =>
    ln - a * Math.max(-1, Math.min(k(n) - 3, Math.min(9 - k(n), 1)));
  return (
    "#" +
    [f(0), f(8), f(4)]
      .map((v) =>
        Math.round(v * 255)
          .toString(16)
          .padStart(2, "0"),
      )
      .join("")
      .toUpperCase()
  );
}

/**
 * Garante texto branco legível sobre a cor da marca: escurece em passos de 4%
 * de luminosidade (HSL) até o contraste com `#FFFFFF` chegar a 4.5. Hex
 * inválido lança erro.
 */
export function ensureReadableBrandColor(hex: string): {
  color: string;
  adjusted: boolean;
} {
  const normalized = normalizeHex(hex);
  if (contrastWithWhite(normalized) >= MIN_CONTRAST) {
    return { color: normalized, adjusted: false };
  }
  const [h, s, l0] = rgbToHsl(toRgb(normalized));
  let l = l0;
  let color = normalized;
  while (contrastWithWhite(color) < MIN_CONTRAST && l > 0) {
    l = Math.max(0, l - 4);
    color = hslToHex(h, s, l);
  }
  return { color, adjusted: true };
}
