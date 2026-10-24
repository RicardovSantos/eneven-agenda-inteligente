import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import * as schema from "@/db/schema";
import type { Db } from "@/db/types";

/**
 * Conexão postgres-js com o banco de `TEST_DATABASE_URL`, como em produção
 * (usuário superusuário). Retorna também `close` e `truncate` (limpa as
 * tabelas entre testes).
 */
export function connectPg() {
  const url = process.env.TEST_DATABASE_URL;
  if (!url) throw new Error("TEST_DATABASE_URL não definido.");
  const client = postgres(url, { max: 5, onnotice: () => {} });
  const db = drizzle(client, { schema }) as unknown as Db;
  return {
    db,
    close: () => client.end(),
    truncate: async () => {
      await client.unsafe("truncate table tenants, users restart identity cascade");
    },
  };
}
