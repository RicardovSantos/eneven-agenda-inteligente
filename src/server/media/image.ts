import sharp from "sharp";

/** Limite de pixels da imagem enviada (proteção contra bomba de descompressão). */
export const MEDIA_MAX_INPUT_PIXELS = 40_000_000;
/** Tamanho máximo do arquivo recebido (o limite das ações do servidor é 2 MB). */
export const MEDIA_MAX_BYTES = 1_900_000;

/** Formatos aceitos, conferidos pelo conteúdo do arquivo e não pelo tipo declarado. */
const ALLOWED_FORMATS = ["jpeg", "png", "webp", "gif", "avif", "tiff"];

export const WEBP_MIME = "image/webp";

/** Erro de imagem com mensagem em português para exibir ao usuário. */
export class MediaError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "MediaError";
  }
}

export type WebpOptions = {
  width: number;
  height: number;
  /** 1 a 100 (padrão 80). */
  quality?: number;
};

/**
 * Converte qualquer imagem aceita para WebP no tamanho pedido (`cover`, já
 * com a rotação do EXIF aplicada e sem metadados). É a única porta de
 * entrada das fotos: o que sai daqui é o que fica guardado no banco.
 */
export async function convertToWebp(
  bytes: Buffer | Uint8Array,
  { width, height, quality = 80 }: WebpOptions,
): Promise<Buffer> {
  if (bytes.byteLength === 0) throw new MediaError("O arquivo está vazio.");
  if (bytes.byteLength > MEDIA_MAX_BYTES) {
    throw new MediaError("A imagem é grande demais. Escolha uma menor.");
  }
  const input = Buffer.from(bytes);
  const limit = { limitInputPixels: MEDIA_MAX_INPUT_PIXELS };
  try {
    const meta = await sharp(input, limit).metadata();
    if (!meta.format || !ALLOWED_FORMATS.includes(meta.format)) throw new Error("formato");
    return await sharp(input, limit)
      .rotate()
      .resize(width, height, { fit: "cover", position: "attention" })
      .webp({ quality, effort: 4 })
      .toBuffer();
  } catch (error) {
    if (error instanceof Error && /pixel limit/i.test(error.message)) {
      throw new MediaError("A imagem é grande demais. Escolha uma menor.");
    }
    throw new MediaError("Não conseguimos ler essa imagem. Tente outro arquivo.");
  }
}
