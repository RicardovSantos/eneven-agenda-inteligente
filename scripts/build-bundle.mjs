/**
 * Gera os scripts de operação autocontidos para produção, em dist/:
 *
 *   node scripts/build-bundle.mjs migrate  ->  dist/migrate.mjs
 *   node scripts/build-bundle.mjs admin    ->  dist/create-super-admin.mjs
 *
 * O caminho PGlite (só desenvolvimento/testes) é substituído por um stub: sem
 * isso o esbuild mantém `import "@electric-sql/pglite"` no topo do bundle e o
 * arquivo exigiria node_modules em runtime.
 *
 * O `@node-rs/argon2` é nativo e não entra no bundle: o script de super-admin
 * o resolve em runtime pelo node_modules da imagem (o build standalone do
 * Next.js já o inclui).
 */
import { build } from "esbuild";

const TARGETS = {
  migrate: { entry: "scripts/migrate.ts", outfile: "dist/migrate.mjs", external: [] },
  admin: {
    entry: "scripts/create-super-admin.ts",
    outfile: "dist/create-super-admin.mjs",
    external: ["@node-rs/argon2"],
  },
};

const name = process.argv[2];
const target = TARGETS[name];
if (!target) {
  console.error(`Uso: node scripts/build-bundle.mjs <${Object.keys(TARGETS).join("|")}>`);
  process.exit(1);
}

const pgliteStub = {
  name: "stub-pglite",
  setup(b) {
    b.onResolve({ filter: /^(@electric-sql\/pglite|drizzle-orm\/pglite)$/ }, (args) => ({
      path: args.path,
      namespace: "pglite-stub",
    }));
    b.onLoad({ filter: /.*/, namespace: "pglite-stub" }, () => ({
      contents:
        'throw new Error("PGlite não está disponível neste bundle de produção. Defina DATABASE_URL.");',
      loader: "js",
    }));
  },
};

await build({
  entryPoints: [target.entry],
  bundle: true,
  platform: "node",
  format: "esm",
  target: "node20",
  outfile: target.outfile,
  external: target.external,
  plugins: [pgliteStub],
  // Dependências CommonJS (postgres, drizzle) usam require() dentro do bundle ESM.
  banner: {
    js: 'import { createRequire as __createRequire } from "node:module"; const require = __createRequire(import.meta.url);',
  },
  logLevel: "info",
});
