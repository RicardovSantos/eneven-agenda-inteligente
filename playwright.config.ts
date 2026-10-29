import { defineConfig } from "@playwright/test";

/**
 * Testes de ponta a ponta (`pnpm test:e2e`): sobem `pnpm dev` com um PGlite só
 * deles e a rota de apoio `/api/e2e/seed` ligada (segredo local). Não fazem
 * parte do `pnpm test`. Pare o `pnpm dev` antes de rodar (o Next
 * permite um servidor de desenvolvimento por pasta).
 */
const port = Number(process.env.E2E_PORT ?? 3100);

export default defineConfig({
  testDir: "tests/e2e",
  testMatch: "**/*.spec.ts",
  testIgnore: "**/*shots.spec.ts",
  fullyParallel: false,
  workers: 1,
  retries: 0,
  // Em desenvolvimento a primeira visita a cada página compila na hora.
  timeout: 120_000,
  expect: { timeout: 20_000 },
  reporter: [["list"]],
  globalSetup: "./tests/e2e/global-setup.ts",
  use: {
    baseURL: `http://localhost:${port}`,
    locale: "pt-BR",
    timezoneId: "America/Sao_Paulo",
    viewport: { width: 390, height: 844 },
    hasTouch: true,
    trace: "retain-on-failure",
  },
  webServer: {
    command: "node scripts/e2e-server.mjs",
    url: `http://localhost:${port}/api/health`,
    timeout: 180_000,
    reuseExistingServer: false,
    env: { E2E_PORT: String(port) },
    stdout: "ignore",
    stderr: "pipe",
  },
});
