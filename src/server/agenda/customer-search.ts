import { ilike, or, sql, type SQL } from "drizzle-orm";
import { customers } from "@/db/schema";

const escapeLike = (value: string) => value.replace(/[\%_]/g, "\$&");

/**
 * Condição de busca de cliente: nome (`ilike`) ou, com 3+ dígitos, trecho do
 * telefone normalizado. Compartilhada pela busca do painel e pela lista de clientes.
 */
export function customerMatch(query: string): SQL | undefined {
  const q = query.trim().slice(0, 80);
  const digits = q.replace(/\D/g, "");
  return or(
    ilike(customers.name, `%${escapeLike(q)}%`),
    digits.length >= 3 ? sql`${customers.phone} like ${`%${digits}%`}` : undefined,
  );
}
