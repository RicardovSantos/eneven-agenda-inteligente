import { and, count, eq, isNull } from "drizzle-orm";
import { businessHours, professionals, services, tenants } from "@/db/schema";
import type { Db } from "@/db/types";
import { withTenant } from "@/server/tenant-db";

export const ONBOARDING_PATH = "/painel/comecar";

export type OnboardingStep = 1 | 2 | 3 | 4;

export type OnboardingState = {
  step: OnboardingStep | "done";
  hasLogo: boolean;
  hasHours: boolean;
  servicesCount: number;
  professionalsCount: number;
};

/**
 * Onde o assistente deve retomar, derivado só do banco (recarregar a página
 * não perde o lugar):
 * - "done": já concluído ou pulado;
 * - 1: a marca ainda não foi salva (o "Continuar" da etapa 1 sempre grava a cor);
 * - 2: marca salva, sem serviços (o horário já vem preenchido no cadastro, então
 *   revisá-lo é a próxima parada);
 * - 4: já há ao menos um serviço (as etapas 2 e 3 foram vencidas).
 * A etapa 3 nunca é "retomada" sozinha: com serviço criado, a pessoa segue para
 * a equipe e volta com "Voltar" se quiser adicionar mais.
 */
export async function getOnboardingState(
  db: Db,
  tenantId: string,
): Promise<OnboardingState> {
  const [tenant] = await db
    .select({
      completedAt: tenants.onboardingCompletedAt,
      brandColor: tenants.brandColor,
      logoUrl: tenants.logoUrl,
    })
    .from(tenants)
    .where(eq(tenants.id, tenantId))
    .limit(1);

  const counts = await withTenant(db, tenantId, async (tx) => {
    const [h] = await tx
      .select({ n: count() })
      .from(businessHours)
      .where(eq(businessHours.tenantId, tenantId));
    const [s] = await tx
      .select({ n: count() })
      .from(services)
      .where(and(eq(services.tenantId, tenantId), isNull(services.archivedAt)));
    const [p] = await tx
      .select({ n: count() })
      .from(professionals)
      .where(and(eq(professionals.tenantId, tenantId), eq(professionals.active, true)));
    return { hours: Number(h.n), services: Number(s.n), professionals: Number(p.n) };
  });

  const step: OnboardingState["step"] = !tenant
    ? 1
    : tenant.completedAt
      ? "done"
      : tenant.brandColor === null
        ? 1
        : counts.services === 0
          ? 2
          : 4;

  return {
    step,
    hasLogo: Boolean(tenant?.logoUrl),
    hasHours: counts.hours > 0,
    servicesCount: counts.services,
    professionalsCount: counts.professionals,
  };
}

/**
 * Marca o assistente como concluído (só na primeira vez: repetir não muda a
 * data). `tenants` não tem RLS: filtra sempre pelo `tenantId` da sessão.
 */
export async function completeOnboarding(db: Db, tenantId: string): Promise<void> {
  await db
    .update(tenants)
    .set({ onboardingCompletedAt: new Date() })
    .where(and(eq(tenants.id, tenantId), isNull(tenants.onboardingCompletedAt)));
}

/** "Fazer depois": para o painel, pular é o mesmo que concluir. */
export const skipOnboarding = completeOnboarding;

/**
 * Para onde mandar quem abre uma página do painel. Só o proprietário passa
 * pelo assistente: enquanto não concluir (ou pular), toda página do painel
 * (`page: "panel"`) leva a `/painel/comecar`; depois, o assistente
 * (`page: "wizard"`) leva de volta ao painel. `null` = ficar onde está.
 */
export function onboardingRedirect(input: {
  role: "owner" | "reception" | "staff" | null;
  completed: boolean;
  page: "panel" | "wizard";
}): string | null {
  const needsWizard = input.role === "owner" && !input.completed;
  if (input.page === "panel") return needsWizard ? ONBOARDING_PATH : null;
  return needsWizard ? null : "/painel";
}
