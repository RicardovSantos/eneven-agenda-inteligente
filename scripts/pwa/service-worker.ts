import { createHash } from "node:crypto";
import { readdir, readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";

const PLACEHOLDER = "__BRAND_HASH__";
const TEMPLATE_FILE = "scripts/pwa/sw.template.js";
const OUTPUT_FILE = "public/sw.js";

/**
 * Hash curto (10 hex) dos arquivos de `brandDir`: entra o nome e o conteúdo de
 * cada arquivo, em ordem alfabética, então trocar, criar, apagar ou renomear
 * qualquer arquivo da marca muda o resultado.
 */
export async function hashBrandAssets(brandDir: string): Promise<string> {
  const names = (await readdir(brandDir, { withFileTypes: true }))
    .filter((entry) => entry.isFile())
    .map((entry) => entry.name)
    .sort();
  const hash = createHash("sha256");
  for (const name of names) {
    hash.update(`${name}\0`);
    hash.update(await readFile(join(brandDir, name)));
    hash.update("\0");
  }
  return hash.digest("hex").slice(0, 10);
}

/**
 * Gera `public/sw.js` a partir de `scripts/pwa/sw.template.js`, trocando
 * `__BRAND_HASH__` pelo hash de `public/brand/` (rodar depois de gerar a
 * marca). Devolve o hash usado como `CACHE_VERSION`.
 */
export async function buildServiceWorker(root: string): Promise<string> {
  const template = await readFile(join(root, TEMPLATE_FILE), "utf8");
  if (!template.includes(PLACEHOLDER)) {
    throw new Error(`${TEMPLATE_FILE} não tem o marcador ${PLACEHOLDER}.`);
  }
  const version = await hashBrandAssets(join(root, "public/brand"));
  await writeFile(join(root, OUTPUT_FILE), template.replaceAll(PLACEHOLDER, version));
  return version;
}
