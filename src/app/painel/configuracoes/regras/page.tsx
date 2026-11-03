import type { Metadata } from "next";
import { RulesForm } from "@/components/settings/rules-form";
import { SettingsPageShell } from "@/components/settings/settings-nav";
import { requirePanelRole } from "@/server/panel/roles";
import { loadTenant } from "../tenant";

export const metadata: Metadata = { title: "Regras de agendamento" };

export default async function RegrasPage() {
  const { session } = await requirePanelRole(["owner"]);
  const { tenant } = await loadTenant(session.tenantId);
  return (
    <SettingsPageShell title="Regras de agendamento" description="Intervalo entre horários, antecedência mínima, até quando agendar e prazo para cancelar.">
      <RulesForm
        initial={{
          slotIntervalMin: tenant.slotIntervalMin,
          minNoticeMin: tenant.minNoticeMin,
          maxDaysAhead: tenant.maxDaysAhead,
          cancelWindowMin: tenant.cancelWindowMin,
        }}
      />
    </SettingsPageShell>
  );
}
