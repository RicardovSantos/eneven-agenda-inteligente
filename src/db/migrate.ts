import path from "node:path";
import type { Db } from "./types";

/** Pasta das migrações geradas pelo drizzle-kit (relativa à raiz do projeto). */
export function migrationsFolder(): string {
  return process.env.MIGRATIONS_DIR ?? path.resolve(process.cwd(), "drizzle");
}

/**
 * Aplica as migrações pendentes. Funciona com postgres-js (cliente é uma
 * função) e com PGlite (cliente é um objeto).
 */
export async function runMigrations(db: Db): Promise<void> {
  const config = { migrationsFolder: migrationsFolder() };
  const client = (db as unknown as { $client?: unknown }).$client;

  if (typeof client === "function") {
    const { migrate } = await import("drizzle-orm/postgres-js/migrator");
    await migrate(db as unknown as Parameters<typeof migrate>[0], config);
  } else {
    const { migrate } = await import("drizzle-orm/pglite/migrator");
    await migrate(db as unknown as Parameters<typeof migrate>[0], config);
  }
}
