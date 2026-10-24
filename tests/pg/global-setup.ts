import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import { runMigrations } from "@/db/migrate";
import * as schema from "@/db/schema";

/**
 * Recria o banco de teste do zero (schema `public` e controle do Drizzle) e
 * aplica todas as migrações antes dos testes. Recusa bancos cujo nome não
 * contenha "test" para nunca apagar dados de verdade por engano.
 */
export default async function setup() {
  const url = process.env.TEST_DATABASE_URL;
  if (!url) throw new Error("TEST_DATABASE_URL não definido.");
  const dbName = new URL(url).pathname.replace(/^\//, "");
  if (!dbName.includes("test")) {
    throw new Error(
      `TEST_DATABASE_URL aponta para "${dbName}": por segurança o banco precisa ter "test" no nome.`,
    );
  }

  const client = postgres(url, { max: 1, onnotice: () => {} });
  try {
    await client.unsafe("drop schema if exists drizzle cascade");
    await client.unsafe("drop schema if exists public cascade");
    await client.unsafe("create schema public");
    await runMigrations(drizzle(client, { schema }));
  } finally {
    await client.end();
  }
}
