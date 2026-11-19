import { and, eq } from "drizzle-orm";
import { deletedTenantBilling } from "@/db/schema";
import type { Db } from "@/db/types";

/**
 * O recurso (assinatura, fatura ou pagamento no provedor) pertencia a um estabelecimento já excluído?
 * Nesse caso o aviso do provedor (por exemplo, o cancelamento que a própria exclusão provocou) não tem mais
 * a que se ligar e é dado como processado, em vez de falhar e tentar de novo para sempre.
 */
export async function isDeletedBillingResource(db: Db, provider: "mercadopago" | "stripe", resourceId: string): Promise<boolean> {
  const [row] = await db.select({ id: deletedTenantBilling.id }).from(deletedTenantBilling)
    .where(and(eq(deletedTenantBilling.provider, provider), eq(deletedTenantBilling.resourceId, resourceId))).limit(1);
  return Boolean(row);
}
