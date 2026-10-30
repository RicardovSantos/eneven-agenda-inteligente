import { asc, eq, sql } from "drizzle-orm";
import { z } from "zod";
import { auditLog, plans, tenants } from "@/db/schema";
import type { Db } from "@/db/types";
import { toFieldErrors } from "@/server/auth/schemas";
import { PlatformError, UUID } from "./errors";
import type { AdminActor } from "./actions";

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

export type PlanRow = {
  id: string;
  code: string;
  name: string;
  priceCents: number;
  maxProfessionals: number | null;
  monthlyMessages: number;
  active: boolean;
  tenantCount: number;
};

/** Todos os planos (inclusive inativos) com quantos estabelecimentos usam cada um. */
export async function listPlans(db: Db): Promise<PlanRow[]> {
  const rows = await db
    .select({
      id: plans.id,
      code: plans.code,
      name: plans.name,
      priceCents: plans.priceCents,
      maxProfessionals: plans.maxProfessionals,
      monthlyMessages: plans.monthlyMessages,
      active: plans.active,
      tenantCount: sql<number>`count(${tenants.id})::int`,
    })
    .from(plans)
    .leftJoin(tenants, eq(tenants.planId, plans.id))
    .groupBy(plans.id)
    .orderBy(asc(plans.sortOrder));
  return rows;
}

const planSchema = z.object({
  name: z.string().trim().min(1, "Informe o nome do plano.").max(60, "O nome pode ter no máximo 60 caracteres."),
  priceCents: z.number().int("Informe o preço em centavos.").min(0, "O preço não pode ser negativo.").max(10_000_000, "Preço alto demais."),
  maxProfessionals: z.number().int("Informe um número inteiro.").min(1, "O mínimo é 1 profissional.").max(1000, "Número alto demais.").nullable(),
  monthlyMessages: z.number().int("Informe um número inteiro.").min(0, "Não pode ser negativo.").max(1_000_000, "Número alto demais."),
  active: z.boolean(),
});

export type PlanInput = z.input<typeof planSchema>;

/**
 * Edita um plano. Desativar só esconde o plano da escolha (quem já está nele
 * continua). O limite de profissionais vale para novas ativações; reduzir o
 * limite não desativa profissionais existentes automaticamente.
 */
export async function updatePlan(
  db: Db,
  actor: AdminActor,
  planId: string,
  input: PlanInput,
): Promise<void> {
  const parsed = planSchema.safeParse(input);
  if (!parsed.success) {
    const fieldErrors = toFieldErrors(parsed.error);
    throw new PlatformError("validation", Object.values(fieldErrors)[0] ?? "Dados inválidos.", fieldErrors);
  }
  if (!UUID.test(planId)) throw new PlatformError("not_found", "Plano não encontrado.");
  const data = parsed.data;

  await db.transaction(async (tx) => {
    const [before] = await tx.select().from(plans).where(eq(plans.id, planId)).limit(1);
    if (!before) throw new PlatformError("not_found", "Plano não encontrado.");
    await tx.update(plans).set(data).where(eq(plans.id, planId));
    await tx.insert(auditLog).values({
      actorUserId: actor.userId,
      tenantId: null,
      action: "plan.updated",
      details: {
        planId,
        code: before.code,
        from: pick(before),
        to: data,
      },
    });
  });
}

const pick = (p: typeof plans.$inferSelect) => ({
  name: p.name,
  priceCents: p.priceCents,
  maxProfessionals: p.maxProfessionals,
  monthlyMessages: p.monthlyMessages,
  active: p.active,
});
