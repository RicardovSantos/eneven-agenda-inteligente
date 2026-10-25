// Servidor de desenvolvimento do `pnpm test:e2e`: PGlite novo e só dele
// (`.data/pglite-e2e`), com a rota de apoio `/api/e2e/seed` ligada.
import { spawn } from "node:child_process";
import { rmSync } from "node:fs";

const port = process.env.E2E_PORT ?? "3100";
const dataDir = ".data/pglite-e2e";
rmSync(dataDir, { recursive: true, force: true });

const child = spawn(`pnpm dev --port ${port}`, {
  stdio: "inherit",
  shell: true,
  env: {
    ...process.env,
    PGLITE_DATA_DIR: dataDir,
    E2E_SEED: process.env.E2E_SEED ?? "e2e-local-secret",
    NEXT_TELEMETRY_DISABLED: "1",
    // Sem DATABASE_URL de verdade: o e2e nunca toca um banco real.
    DATABASE_URL: "",
  },
});
for (const signal of ["SIGINT", "SIGTERM"]) process.on(signal, () => child.kill(signal));
child.on("exit", (code) => process.exit(code ?? 0));
