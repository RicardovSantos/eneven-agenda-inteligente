import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { buildServiceWorker } from "../pwa/service-worker";
import { runBrand } from "./run";

// Ponto de entrada de `pnpm brand` (predev e prebuild). A lógica fica em
// `run.ts`, `generate.ts` e `scripts/pwa/service-worker.ts`, que só exportam
// funções e são testadas à parte.
const root = resolve(dirname(fileURLToPath(import.meta.url)), "../..");

async function main(): Promise<void> {
  const files = await runBrand(root);
  console.log(`brand: ${files.length} arquivos gerados em public/brand/`);
  // O service worker depende dos arquivos gerados acima (hash no CACHE_VERSION).
  const version = await buildServiceWorker(root);
  console.log(`brand: public/sw.js gerado (CACHE_VERSION ${version})`);
}

main().catch((error: unknown) => {
  console.error(`brand: ${error instanceof Error ? error.message : String(error)}`);
  process.exit(1);
});
