import { and, eq } from "drizzle-orm";
import { customers } from "@/db/schema";
import type { Db } from "@/db/types";
import { normalizeBrazilPhone } from "@/lib/phone";
import { BookingError } from "./errors";

export type CustomerInput = { name: string; phone: string; email?: string | null };

/**
 * Cria ou atualiza o cliente do tenant pelo telefone normalizado. Em cliente
 * existente, o nome só muda se o novo não for vazio e o e-mail só se vier.
 * `tx` deve ser a transação de `withTenant`.
 */
export async function upsertCustomer(
  tx: Db,
  tenantId: string,
  input: CustomerInput,
): Promise<{ id: string }> {
  const phone = normalizeBrazilPhone(input.phone);
  if (!phone) throw new BookingError("invalid_selection", "Telefone inválido.");
  const name = input.name.trim();
  const email = input.email?.trim() || null;

  const find = () =>
    tx
      .select({ id: customers.id })
      .from(customers)
      .where(and(eq(customers.tenantId, tenantId), eq(customers.phone, phone)))
      .limit(1);

  let [row] = await find();
  if (!row) {
    // Se outra transação criou o mesmo telefone agora, o conflito é ignorado
    // e relemos a linha existente.
    await tx
      .insert(customers)
      .values({ tenantId, name: name || "Cliente", phone, email })
      .onConflictDoNothing({ target: [customers.tenantId, customers.phone] });
    [row] = await find();
    if (!row) throw new Error("Falha ao registrar o cliente");
  }

  const patch: Partial<typeof customers.$inferInsert> = {};
  if (name) patch.name = name;
  if (email) patch.email = email;
  if (Object.keys(patch).length > 0) {
    await tx
      .update(customers)
      .set(patch)
      .where(and(eq(customers.tenantId, tenantId), eq(customers.id, row.id)));
  }
  return { id: row.id };
}
