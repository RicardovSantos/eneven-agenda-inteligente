type PgErrorShape = {
  code?: unknown;
  constraint?: unknown;
  constraint_name?: unknown;
  cause?: unknown;
};

/**
 * O Drizzle embrulha o erro do driver (`error.cause`). Detecta violação de
 * unicidade (23505) de uma constraint específica, tanto com postgres-js
 * (`constraint_name`) quanto com PGlite/pg (`constraint`).
 */
export function isUniqueViolation(error: unknown, constraint: string): boolean {
  let current: unknown = error;
  for (let depth = 0; depth < 4 && current && typeof current === "object"; depth++) {
    const e = current as PgErrorShape;
    if (
      e.code === "23505" &&
      (e.constraint === constraint || e.constraint_name === constraint)
    ) {
      return true;
    }
    current = e.cause;
  }
  return false;
}
