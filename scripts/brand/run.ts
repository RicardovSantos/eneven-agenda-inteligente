import { access, readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { brandConfigSchema, generateBrandAssets, type BrandConfig } from "./generate";

const LOGO_FILE = "marca/logo.png";
const CONFIG_FILE = "marca/marca.config.json";

const exists = (path: string) =>
  access(path).then(
    () => true,
    () => false,
  );

/** Valida o conteúdo de `marca/marca.config.json`; o erro aponta o campo com problema. */
export function parseBrandConfig(raw: unknown): BrandConfig {
  const result = brandConfigSchema.safeParse(raw);
  if (result.success) return result.data;
  const details = result.error.issues
    .map((issue) => `${issue.path.join(".") || "(raiz)"}: ${issue.message}`)
    .join("; ");
  throw new Error(`${CONFIG_FILE} inválido (${details}).`);
}

/**
 * Gera os ícones e imagens de compartilhamento de `root`: lê `marca/logo.png`
 * e `marca/marca.config.json` e grava em `public/brand/`. Devolve os caminhos
 * gerados. Erros têm mensagem pronta para o terminal.
 */
export async function runBrand(root: string): Promise<string[]> {
  const logoPath = resolve(root, LOGO_FILE);
  const configPath = resolve(root, CONFIG_FILE);

  if (!(await exists(logoPath))) {
    throw new Error(`${LOGO_FILE} não encontrado. Coloque a logo oficial nesse caminho e rode de novo.`);
  }
  if (!(await exists(configPath))) {
    throw new Error(`${CONFIG_FILE} não encontrado.`);
  }

  let raw: unknown;
  try {
    raw = JSON.parse(await readFile(configPath, "utf8"));
  } catch {
    throw new Error(`${CONFIG_FILE} não é um JSON válido.`);
  }

  return generateBrandAssets({
    logoPath,
    outDir: resolve(root, "public/brand"),
    config: parseBrandConfig(raw),
  });
}
