import { PGlite } from "@electric-sql/pglite";
import { btree_gist } from "@electric-sql/pglite/contrib/btree_gist";
import { drizzle } from "drizzle-orm/pglite";
import { runMigrations } from "@/db/migrate";
import * as schema from "@/db/schema";
import type { Db } from "@/db/types";

/**
 * Iniciar um PGlite do zero (initdb) leva vários segundos. Por isso, por
 * worker, o banco é criado e migrado uma única vez e o diretório de dados
 * resultante vira um "template" carregado em cada novo banco (~0,7 s).
 */
let template: Promise<Blob | File> | undefined;
const open = new Set<PGlite>();

async function buildTemplate(): Promise<Blob | File> {
  const base = new PGlite({ extensions: { btree_gist } });
  await runMigrations(drizzle(base, { schema }));
  const dump = await base.dumpDataDir("none");
  await base.close();
  return dump;
}

/** Banco PGlite em memória, isolado, com as mesmas migrações de `drizzle/`. */
export async function createTestDb(): Promise<Db> {
  template ??= buildTemplate();
  const client = new PGlite({
    loadDataDir: await template,
    extensions: { btree_gist },
  });
  open.add(client);
  return drizzle(client, { schema });
}

/** Fecha todos os bancos de teste abertos (chamado pelo setup do Vitest). */
export async function closeTestDbs(): Promise<void> {
  const clients = [...open];
  open.clear();
  await Promise.all(clients.map((c) => c.close()));
}
