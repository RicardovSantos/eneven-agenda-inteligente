import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

/**
 * Testes contra um PostgreSQL real (`TEST_DATABASE_URL`), em `tests/pg/`.
 * Cobrem o que o PGlite não reproduz fielmente: conexão como superusuário
 * (como em produção), concorrência entre conexões e a trava de dupla reserva.
 * Rodar com `pnpm test:pg` (sem TEST_DATABASE_URL o comando só avisa e sai).
 */
export default defineConfig({
  test: {
    environment: "node",
    include: ["tests/pg/**/*.test.ts"],
    globals: true,
    globalSetup: ["tests/pg/global-setup.ts"],
    // Todos os testes compartilham o mesmo banco: nada de paralelismo entre arquivos.
    fileParallelism: false,
    testTimeout: 30_000,
    hookTimeout: 60_000,
  },
  resolve: {
    alias: {
      "@": fileURLToPath(new URL("./src", import.meta.url)),
    },
  },
});
