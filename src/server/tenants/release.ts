type TenantTiming = {
  status: "trial" | "active" | "past_due" | "read_only" | "canceled";
  trialEndsAt: Date;
  pastDueAt?: Date | null;
};

/**
 * Regra única de "estabelecimento ativo": plano `active` ou teste (`trial`)
 * ainda dentro do prazo. Usada pela página pública (`canBook`) e pelo painel
 * (link "Seu link"), para os dois nunca divergirem.
 */
export function isTenantActive(tenant: TenantTiming, now: Date = new Date()): boolean {
  return (
    tenant.status === "active" ||
    (tenant.status === "trial" && tenant.trialEndsAt.getTime() > now.getTime()) ||
    (tenant.status === "past_due" && !!tenant.pastDueAt && Number.isFinite(tenant.pastDueAt.getTime()) && tenant.pastDueAt.getTime() <= now.getTime() && now.getTime() < tenant.pastDueAt.getTime() + 7 * 86_400_000)
  );
}

/** Link público liberado: e-mail do dono confirmado e estabelecimento ativo. */
export function isTenantReleased(
  tenant: TenantTiming & { emailVerified: boolean },
  now: Date = new Date(),
): boolean {
  return tenant.emailVerified && isTenantActive(tenant, now);
}

export type TenantSituation =
  | "trial"
  | "trial_expired"
  | "active"
  | "past_due"
  | "read_only"
  | "canceled";

/** Situação exibida ao dono da plataforma: separa teste em andamento de teste vencido. Pura. */
export function tenantSituation(
  tenant: TenantTiming,
  now: Date = new Date(),
): TenantSituation {
  if (tenant.status === "trial") {
    return tenant.trialEndsAt.getTime() > now.getTime() ? "trial" : "trial_expired";
  }
  return tenant.status;
}
