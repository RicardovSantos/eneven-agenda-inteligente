import { mkdirSync } from "node:fs";
import path from "node:path";
import { runMigrations } from "./migrate";
import * as schema from "./schema";
import type { Db } from "./types";

/**
 * Pasta do PGlite usado em desenvolvimento quando não há DATABASE_URL.
 * `PGLITE_DATA_DIR` troca a pasta (o `pnpm test:e2e` usa um banco só dele).
 */
export const PGLITE_DATA_DIR = "./.data/pglite";

const globalForDb = globalThis as unknown as {
  __enevenDb?: Promise<Db>;
};

async function createDb(): Promise<Db> {
  const url = process.env.DATABASE_URL;

  if (url) {
    const [{ default: postgres }, { drizzle }] = await Promise.all([
      import("postgres"),
      import("drizzle-orm/postgres-js"),
    ]);
    return drizzle(postgres(url, { onnotice: () => {} }), { schema });
  }

  if (process.env.NODE_ENV === "production") {
    throw new Error(
      "DATABASE_URL não definido. Configure a conexão com o PostgreSQL.",
    );
  }

  // Desenvolvimento sem Postgres: PGlite persistido em disco.
  const [{ PGlite }, { drizzle }, { btree_gist }] = await Promise.all([
    import("@electric-sql/pglite"),
    import("drizzle-orm/pglite"),
    // Necessária para a trava de dupla reserva (EXCLUDE USING gist).
    import("@electric-sql/pglite/contrib/btree_gist"),
  ]);
  // Só desenvolvimento/testes (produção exige DATABASE_URL): não é para rastrear o projeto inteiro no build.
  const dataDir = path.resolve(
    /*turbopackIgnore: true*/ process.cwd(),
    process.env.PGLITE_DATA_DIR || PGLITE_DATA_DIR,
  );
  mkdirSync(dataDir, { recursive: true });
  const db = drizzle(new PGlite(dataDir, { extensions: { btree_gist } }), {
    schema,
  });
  await runMigrations(db);
  return db;
}

/**
 * Retorna a conexão com o banco, criada de forma preguiçosa (nada conecta no
 * import, então `next build` não precisa de banco). A mesma instância é
 * reutilizada por todo o processo.
 *
 * - `DATABASE_URL` definido: PostgreSQL via postgres-js.
 * - Sem `DATABASE_URL` fora de produção: PGlite em `./.data/pglite`, com
 *   migrações aplicadas automaticamente na primeira chamada.
 * - Sem `DATABASE_URL` em produção: lança erro.
 */
export function getDb(): Promise<Db> {
  if (!globalForDb.__enevenDb) {
    const pending = createDb();
    // Se falhar, permite nova tentativa na próxima chamada.
    pending.catch(() => {
      globalForDb.__enevenDb = undefined;
    });
    globalForDb.__enevenDb = pending;
  }
  return globalForDb.__enevenDb;
}
