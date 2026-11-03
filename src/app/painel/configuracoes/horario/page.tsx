import type { Metadata } from "next";
import { HoursForm } from "@/components/settings/hours-form";
import { SettingsPageShell } from "@/components/settings/settings-nav";
import { defaultApplyToTeam, getBusinessHours } from "@/server/settings";
import { requirePanelRole } from "@/server/panel/roles";
import { loadTenant } from "../tenant";

export const metadata: Metadata = { title: "Horário de atendimento" };

export default async function HorarioPage() {
  const { session } = await requirePanelRole(["owner"]);
  const { db, tenant } = await loadTenant(session.tenantId);
  const [hours, applyToTeamDefault] = await Promise.all([
    getBusinessHours(db, tenant.id),
    defaultApplyToTeam(db, tenant.id),
  ]);
  return (
    <SettingsPageShell title="Horário de atendimento" description="Os dias e horários em que seu estabelecimento atende.">
      <HoursForm initial={hours} applyToTeamDefault={applyToTeamDefault} />
    </SettingsPageShell>
  );
}
