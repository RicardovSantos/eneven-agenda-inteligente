import { eq } from "drizzle-orm";
import { plans } from "@/db/schema";
import type { Db } from "@/db/types";

/** Plano em que todo estabelecimento novo entra. */
export const DEFAULT_PLAN_CODE = "essencial";

/** Id do plano padrão (semeado pela migração `0005_plano3.sql`). */
export async function getDefaultPlanId(db: Db): Promise<string> {
  const [plan] = await db
    .select({ id: plans.id })
    .from(plans)
    .where(eq(plans.code, DEFAULT_PLAN_CODE))
    .limit(1);
  if (!plan) {
    throw new Error(`Plano padrão "${DEFAULT_PLAN_CODE}" não encontrado.`);
  }
  return plan.id;
}
