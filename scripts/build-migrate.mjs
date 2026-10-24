/**
 * Gera dist/migrate.mjs: o script de migração autocontido para produção.
 *
 * O caminho PGlite (só desenvolvimento/testes) é substituído por um stub: sem
 * isso o esbuild mantém `import "@electric-sql/pglite"` no topo do bundle e o
 * arquivo exigiria node_modules em runtime.
 */
import { build } from "esbuild";

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
  entryPoints: ["scripts/migrate.ts"],
  bundle: true,
  platform: "node",
  format: "esm",
  target: "node20",
  outfile: "dist/migrate.mjs",
  plugins: [pgliteStub],
  logLevel: "info",
});
