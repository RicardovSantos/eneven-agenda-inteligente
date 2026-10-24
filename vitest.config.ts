import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    environment: "node",
    include: ["tests/**/*.test.ts"],
    // tests/pg exige PostgreSQL real: rodam em `pnpm test:pg` (vitest.pg.config.ts).
    exclude: ["tests/pg/**", "**/node_modules/**"],
    globals: true,
    setupFiles: ["tests/helpers/setup.ts"],
    // PGlite leva alguns segundos para iniciar no primeiro uso de cada worker (com a suíte inteira em paralelo passa de 30 s).
    testTimeout: 60_000,
    hookTimeout: 60_000,
  },
  resolve: {
    alias: {
      "@": fileURLToPath(new URL("./src", import.meta.url)),
    },
  },
});
