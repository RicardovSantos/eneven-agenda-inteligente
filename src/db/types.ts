import type { PgDatabase, PgQueryResultHKT } from "drizzle-orm/pg-core";
import type * as schema from "./schema";

/**
 * Tipo comum a todos os drivers (postgres-js em produção, PGlite em dev/testes).
 * Toda função de servidor que acessa o banco recebe um `Db`.
 */
export type Db = PgDatabase<PgQueryResultHKT, typeof schema>;
