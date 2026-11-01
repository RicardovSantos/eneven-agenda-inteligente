/**
 * Conversão de imagens no navegador, antes do envio: qualquer formato que o
 * navegador abra (JPG, PNG, GIF, WebP, AVIF, HEIC no Safari...) vira WebP
 * reduzido, então o upload pesa uma fração da foto original. O servidor
 * confere e converte de novo: este passo só poupa banda e o limite de envio.
 */

/** Tamanho máximo que mandamos ao servidor (o limite das ações dele é 2 MB). */
const TARGET_BYTES = 1_500_000;

type Options = {
  /** Maior lado da imagem final, em pixels. */
  maxSide: number;
  /** Qualidade inicial de 0 a 1 (cai aos poucos se o arquivo ainda ficar grande). */
  quality?: number;
};

export class ImageConvertError extends Error {}

const toBlob = (canvas: HTMLCanvasElement, type: string, quality: number) =>
  new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, type, quality));

/** Devolve um arquivo WebP (ou JPEG nos navegadores que não codificam WebP). */
export async function convertImageFile(file: File, { maxSide, quality = 0.82 }: Options): Promise<File> {
  let bitmap: ImageBitmap;
  try {
    bitmap = await createImageBitmap(file, { imageOrientation: "from-image" });
  } catch {
    throw new ImageConvertError("Não conseguimos ler essa imagem. Tente outro arquivo.");
  }

  try {
    const scale = Math.min(1, maxSide / Math.max(bitmap.width, bitmap.height));
    const width = Math.max(1, Math.round(bitmap.width * scale));
    const height = Math.max(1, Math.round(bitmap.height * scale));
    const canvas = document.createElement("canvas");
    canvas.width = width;
    canvas.height = height;
    const context = canvas.getContext("2d");
    if (!context) throw new ImageConvertError("Não conseguimos preparar essa imagem.");
    context.drawImage(bitmap, 0, 0, width, height);

    let q = quality;
    for (let attempt = 0; attempt < 5; attempt++) {
      let blob = await toBlob(canvas, "image/webp", q);
      // Safari não codifica WebP no canvas e devolve PNG: usa JPEG, que o servidor converte.
      if (!blob || blob.type !== "image/webp") blob = await toBlob(canvas, "image/jpeg", q);
      if (!blob) break;
      if (blob.size <= TARGET_BYTES || attempt === 4) {
        const extension = blob.type === "image/webp" ? "webp" : "jpg";
        const base = file.name.replace(/\.[^.]+$/, "") || "imagem";
        return new File([blob], `${base}.${extension}`, { type: blob.type });
      }
      q -= 0.15;
    }
    throw new ImageConvertError("Não conseguimos preparar essa imagem.");
  } finally {
    bitmap.close();
  }
}
