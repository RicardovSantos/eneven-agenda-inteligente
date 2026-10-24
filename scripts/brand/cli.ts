import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { runBrand } from "./run";

// Ponto de entrada de `pnpm brand` (predev e prebuild). A lógica fica em
// `run.ts` e `generate.ts`, que só exportam funções e são testadas à parte.
const root = resolve(dirname(fileURLToPath(import.meta.url)), "../..");

runBrand(root).then(
  (files) => {
    console.log(`brand: ${files.length} arquivos gerados em public/brand/`);
  },
  (error: unknown) => {
    console.error(`brand: ${error instanceof Error ? error.message : String(error)}`);
    process.exit(1);
  },
);
