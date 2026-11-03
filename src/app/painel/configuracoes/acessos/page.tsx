import type { Metadata } from "next";
import { SettingsPageShell } from "@/components/settings/settings-nav";
import { TeamAccessCard } from "@/components/settings/team-access-card";
import { listInvitableProfessionals, listTeamAccess } from "@/server/team/members";
import { requirePanelRole } from "@/server/panel/roles";
import { loadTenant } from "../tenant";

export const metadata: Metadata = { title: "Acessos da equipe" };

export default async function AcessosPage() {
  const { session } = await requirePanelRole(["owner"]);
  const { db, tenant } = await loadTenant(session.tenantId);
  const [team, invitable] = await Promise.all([listTeamAccess(db, tenant.id), listInvitableProfessionals(db, tenant.id)]);
  return (
    <SettingsPageShell title="Acessos da equipe" description="Convide pessoas para usar o painel e controle o que cada uma vê.">
      <TeamAccessCard
        members={team.map((row) =>
          row.kind === "member"
            ? row
            : {
                kind: "invite" as const,
                invitationId: row.invitationId,
                name: row.name,
                email: row.email,
                role: row.role,
                professionalName: row.professionalName,
                expired: row.expired,
              },
        )}
        professionals={invitable}
      />
    </SettingsPageShell>
  );
}
