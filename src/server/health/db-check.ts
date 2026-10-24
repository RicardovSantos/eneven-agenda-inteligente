import { sql } from "drizzle-orm";
import type { Db } from "@/db/types";

/** Tempo máximo para o banco responder ao `select 1`. */
export const DB_CHECK_TIMEOUT_MS = 2000;

/**
 * Confere o banco com `select 1`. 200 `{status:"ok",db:"ok"}` ou, em qualquer
 * falha (conexão, erro ou mais de `timeoutMs`), 503
 * `{status:"error",db:"unreachable"}`: o erro vai só para o log do servidor,
 * nunca para a resposta. `getDatabase` e `timeoutMs` existem para os testes.
 */
export async function checkDatabase(
  getDatabase: () => Promise<Db>,
  timeoutMs: number = DB_CHECK_TIMEOUT_MS,
): Promise<Response> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    const timeout = new Promise<never>((_, reject) => {
      timer = setTimeout(() => reject(new Error("tempo esgotado")), timeoutMs);
    });
    await Promise.race([
      (async () => {
        const db = await getDatabase();
        await db.execute(sql`select 1`);
      })(),
      timeout,
    ]);
    return Response.json({ status: "ok", db: "ok" });
  } catch (error) {
    console.error("Falha na checagem do banco", error);
    return Response.json({ status: "error", db: "unreachable" }, { status: 503 });
  } finally {
    clearTimeout(timer);
  }
}
