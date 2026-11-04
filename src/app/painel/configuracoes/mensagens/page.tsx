import { eq } from "drizzle-orm";
import { getDb } from "@/db/client";
import { plans, tenantNotificationSettings, tenants } from "@/db/schema";
import { requirePanelRole } from "@/server/panel/roles";
import { withTenant } from "@/server/tenant-db";
import { checkTenantQuota } from "@/server/whatsapp/quota";
import { SettingsPageShell } from "@/components/settings/settings-nav";
import { SettingsSection } from "@/components/settings/settings-section";
import { WhatsAppSettingsForm } from "@/components/settings/whatsapp-settings-form";

export default async function MensagensPage() {
  const { session } = await requirePanelRole(["owner"]);
  const db = await getDb();
  const [settings] = await withTenant(db, session.tenantId, (tx) => tx.select().from(tenantNotificationSettings).where(eq(tenantNotificationSettings.tenantId, session.tenantId)).limit(1));
  const [tenant] = await db.select({ code: plans.code }).from(tenants).innerJoin(plans, eq(plans.id, tenants.planId)).where(eq(tenants.id, session.tenantId)).limit(1);
  const quota = await checkTenantQuota(db, session.tenantId);
  const twoHours = ["profissional", "studio"].includes(tenant?.code ?? "");
  const options = [
    { key: "bookingCreated", label: "Confirmação de novo agendamento", checked: settings?.bookingCreated ?? false },
    { key: "reminderEve", label: "Lembrete na véspera", checked: settings?.reminderEve ?? true },
    { key: "reminder2h", label: "Lembrete 2 horas antes", checked: twoHours && (settings?.reminder2h ?? false), disabled: !twoHours },
    { key: "rescheduled", label: "Aviso de remarcação", checked: settings?.rescheduled ?? true },
    { key: "canceled", label: "Aviso de cancelamento", checked: settings?.canceled ?? true },
  ];
  return (
    <SettingsPageShell title="Mensagens WhatsApp" description="Lembretes e avisos que seus clientes recebem sozinhos.">
      <SettingsSection id="franquia" title="Franquia do mês">
        <div className="flex flex-col gap-2">
          <p className="m-0">{quota.used} de {quota.total} mensagens usadas</p>
          <progress aria-label="Mensagens usadas no mês" className="w-full" value={Math.min(quota.used, quota.total)} max={quota.total} />
          {!quota.allowed ? <p className="m-0 text-danger">Franquia esgotada. Use o WhatsApp manual para lembrar seus clientes.</p> : quota.used >= quota.total * 0.8 ? <p className="m-0">Você já usou 80% da franquia.</p> : null}
        </div>
      </SettingsSection>
      <WhatsAppSettingsForm options={options} twoHours={twoHours} />
    </SettingsPageShell>
  );
}
