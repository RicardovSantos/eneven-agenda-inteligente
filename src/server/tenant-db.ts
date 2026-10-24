import { sql } from "drizzle-orm";
import type { Db } from "@/db/types";

/**
 * Acesso ao banco no contexto de um estabelecimento (tenant). TODA consulta a
 * tabela com `tenant_id` passa por aqui: dentro da transação o papel vira
 * `agenda_app` (sem privilégio de superusuário) e `app.tenant_id` define o que
 * as políticas de RLS deixam ver e gravar.
 *
 * `tenantId` vem sempre do servidor (sessão ou slug resolvido), nunca de corpo
 * de requisição. O parâmetro é passado como valor (`set_config`), sem
 * interpolação de SQL.
 */
export async function withTenant<T>(
  db: Db,
  tenantId: string,
  fn: (tx: Db) => Promise<T>,
): Promise<T> {
  return db.transaction(async (tx) => {
    await tx.execute(sql`select set_config('app.tenant_id', ${tenantId}, true)`);
    await tx.execute(sql`set local role agenda_app`);
    return fn(tx as unknown as Db);
  });
}
