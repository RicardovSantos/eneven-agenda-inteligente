/**
 * `pnpm test:pg`: roda os testes de `tests/pg/` num PostgreSQL real. Sem
 * TEST_DATABASE_URL (caso local, sem Postgres) avisa e sai com sucesso; o CI
 * define a variável no job `test-pg`.
 */
import { spawnSync } from "node:child_process";

if (!process.env.TEST_DATABASE_URL) {
  console.log(
    "test:pg ignorado: defina TEST_DATABASE_URL (ex.: postgres://agenda:agenda@localhost:5432/agenda_test) para rodar os testes contra um PostgreSQL real. O banco será recriado do zero.",
  );
  process.exit(0);
}

const result = spawnSync(
  "pnpm",
  ["exec", "vitest", "run", "--config", "vitest.pg.config.ts", ...process.argv.slice(2)],
  { stdio: "inherit", shell: true },
);
process.exit(result.status ?? 1);
