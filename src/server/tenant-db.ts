import { sql } from "drizzle-orm";
import type { Db } from "@/db/types";

/**
 * Tipo da transação que `withTenant` entrega ao callback: a transação do
 * Drizzle (e não o `Db` completo), então o código de negócio não alcança a
 * conexão (`$client`) para sair do contexto do tenant.
 */
export type TenantTx = Parameters<Parameters<Db["transaction"]>[0]>[0];

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
  fn: (tx: TenantTx) => Promise<T>,
): Promise<T> {
  return db.transaction((tx) => withTenantTx(tx, tenantId, fn));
}

/**
 * Mesma regra de `withTenant`, dentro de uma transação que já existe (ex.: a
 * do cadastro, que cria o estabelecimento e já grava horário e profissional).
 * Troca o papel para `agenda_app` e define `app.tenant_id` só para o bloco e
 * devolve a transação ao papel original ao terminar, para o que vier depois
 * na mesma transação seguir como antes. Se `fn` lançar erro a transação
 * inteira é desfeita, então não há o que restaurar.
 */
export async function withTenantTx<T>(
  tx: TenantTx,
  tenantId: string,
  fn: (tx: TenantTx) => Promise<T>,
): Promise<T> {
  await tx.execute(sql`select set_config('app.tenant_id', ${tenantId}, true)`);
  await tx.execute(sql`set local role agenda_app`);
  const result = await fn(tx);
  await tx.execute(sql`reset role`);
  await tx.execute(sql`select set_config('app.tenant_id', '', true)`);
  return result;
}
