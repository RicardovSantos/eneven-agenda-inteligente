import { expect } from "vitest";
import { sql } from "drizzle-orm";
import type { Db } from "@/db/types";

/** `db.execute` devolve `{ rows }` no PGlite e um array no postgres-js. */
export async function queryRows<T>(db: Db, query: ReturnType<typeof sql>): Promise<T[]> {
  const result = (await db.execute(query)) as unknown;
  return (Array.isArray(result) ? result : (result as { rows: T[] }).rows) as T[];
}

/** Executa e devolve o erro lançado (ou null). */
export function failure(promise: PromiseLike<unknown>): Promise<unknown> {
  return Promise.resolve(promise).then(
    () => null,
    (e: unknown) => e,
  );
}

/** SQLSTATE do erro do driver (o Drizzle embrulha em `cause`). */
export function sqlState(error: unknown): string | undefined {
  let current: unknown = error;
  for (let depth = 0; depth < 4 && current && typeof current === "object"; depth++) {
    const code = (current as { code?: unknown }).code;
    if (typeof code === "string" && /^[0-9A-Z]{5}$/.test(code)) return code;
    current = (current as { cause?: unknown }).cause;
  }
  return undefined;
}

/** Erro de política de RLS: SQLSTATE 42501 ou a mensagem do PostgreSQL. */
export function expectRlsViolation(error: unknown) {
  expect(error).not.toBeNull();
  const messages: string[] = [];
  let current: unknown = error;
  for (let depth = 0; depth < 4 && current && typeof current === "object"; depth++) {
    const message = (current as { message?: unknown }).message;
    if (typeof message === "string") messages.push(message);
    current = (current as { cause?: unknown }).cause;
  }
  const isRls =
    sqlState(error) === "42501" ||
    messages.some((m) => m.includes("row-level security"));
  expect(isRls, `esperava violação de RLS, veio: ${messages.join(" | ")}`).toBe(true);
}

/**
 * Tabelas (exceto `tenants`) em que `agenda_app` tem algum privilégio de dados
 * mas falta RLS habilitado, forçado ou a política `tenant_isolation`. Também
 * devolve a lista completa para checar que há tabelas cobertas.
 */
export async function agendaAppTables(db: Db) {
  return queryRows<{
    name: string;
    rls: boolean;
    forced: boolean;
    has_policy: boolean;
  }>(
    db,
    sql`
      select c.relname as name,
             c.relrowsecurity as rls,
             c.relforcerowsecurity as forced,
             exists (
               select 1 from pg_policies p
               where p.schemaname = 'public'
                 and p.tablename = c.relname
                 and p.policyname = 'tenant_isolation'
             ) as has_policy
      from pg_class c
      join pg_namespace n on n.oid = c.relnamespace
      where n.nspname = 'public'
        and c.relkind in ('r', 'p')
        and c.relname <> 'tenants'
        and (
          has_table_privilege('agenda_app', c.oid, 'select')
          or has_table_privilege('agenda_app', c.oid, 'insert')
          or has_table_privilege('agenda_app', c.oid, 'update')
          or has_table_privilege('agenda_app', c.oid, 'delete')
        )
      order by c.relname
    `,
  );
}

export async function expectEveryAgendaAppTableHasRls(db: Db) {
  const tables = await agendaAppTables(db);
  const names = tables.map((t) => t.name);
  expect(names).toEqual(
    expect.arrayContaining(["bookings", "customers", "professionals", "services"]),
  );
  for (const forbidden of [
    "users",
    "sessions",
    "email_tokens",
    "oauth_accounts",
    "audit_log",
    "memberships",
  ]) {
    expect(names).not.toContain(forbidden);
  }
  const missing = tables.filter((t) => !t.rls || !t.forced || !t.has_policy);
  expect(
    missing.map((t) => t.name),
    "tabelas acessíveis ao agenda_app sem RLS (ENABLE + FORCE + política tenant_isolation)",
  ).toEqual([]);
}
