/**
 * Aplica as migrações pendentes e encerra.
 *
 * - Desenvolvimento: `pnpm db:migrate` (tsx).
 * - Produção: `node dist/migrate.mjs` (gerado por `pnpm build:migrate`),
 *   com DATABASE_URL definido e a pasta `drizzle/` acessível a partir do
 *   diretório atual (ou indicada em MIGRATIONS_DIR).
 */
import { getDb } from "../src/db/client";
import { runMigrations } from "../src/db/migrate";

async function main() {
  const db = await getDb();
  await runMigrations(db);
  console.log("Migrações aplicadas.");

  // Encerra a conexão para o processo poder sair (postgres-js: end; PGlite: close).
  const client = (db as unknown as { $client: { end?: () => Promise<void>; close?: () => Promise<void> } })
    .$client;
  await (client.end?.() ?? client.close?.());
}

main().catch((error) => {
  console.error("Falha ao aplicar migrações:", error);
  process.exit(1);
});
