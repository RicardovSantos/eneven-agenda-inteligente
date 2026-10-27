type TenantTiming = {
  status: "trial" | "active" | "past_due" | "read_only" | "canceled";
  trialEndsAt: Date;
};

/**
 * Regra única de "estabelecimento ativo": plano `active` ou teste (`trial`)
 * ainda dentro do prazo. Usada pela página pública (`canBook`) e pelo painel
 * (link "Seu link"), para os dois nunca divergirem.
 */
export function isTenantActive(tenant: TenantTiming, now: Date = new Date()): boolean {
  return (
    tenant.status === "active" ||
    (tenant.status === "trial" && tenant.trialEndsAt.getTime() > now.getTime())
  );
}

/** Link público liberado: e-mail do dono confirmado e estabelecimento ativo. */
export function isTenantReleased(
  tenant: TenantTiming & { emailVerified: boolean },
  now: Date = new Date(),
): boolean {
  return tenant.emailVerified && isTenantActive(tenant, now);
}
