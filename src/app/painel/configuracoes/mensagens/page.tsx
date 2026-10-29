import Link from "next/link";
import { eq } from "drizzle-orm";
import { getDb } from "@/db/client";
import { plans, tenantNotificationSettings, tenants } from "@/db/schema";
import { requirePanelRole } from "@/server/panel/roles";
import { withTenant } from "@/server/tenant-db";
import { checkTenantQuota } from "@/server/whatsapp/quota";
import { saveWhatsAppSettings } from "./actions";

export default async function MensagensPage() {
  const { session } = await requirePanelRole(["owner"]);
  const db = await getDb();
  const [settings] = await withTenant(db, session.tenantId, (tx) => tx.select().from(tenantNotificationSettings).where(eq(tenantNotificationSettings.tenantId, session.tenantId)).limit(1));
  const [tenant] = await db.select({ code: plans.code }).from(tenants).innerJoin(plans, eq(plans.id, tenants.planId)).where(eq(tenants.id, session.tenantId)).limit(1);
  const quota = await checkTenantQuota(db, session.tenantId);
  const twoHours = ["profissional", "studio"].includes(tenant?.code ?? "");
  const options = [
    { key: "bookingCreated", label: "Confirmação de novo agendamento", checked: settings?.bookingCreated ?? true },
    { key: "reminderEve", label: "Lembrete na véspera", checked: settings?.reminderEve ?? true },
    { key: "reminder2h", label: "Lembrete 2 horas antes", checked: twoHours && (settings?.reminder2h ?? false), disabled: !twoHours },
    { key: "rescheduled", label: "Aviso de remarcação", checked: settings?.rescheduled ?? true },
    { key: "canceled", label: "Aviso de cancelamento", checked: settings?.canceled ?? true },
  ];
  return <div className="mx-auto flex w-full max-w-[720px] flex-col gap-6">
    <Link href="/painel/configuracoes" className="text-sm text-primary">‹ Configurações</Link>
    <h1 className="text-[1.75rem] font-semibold">Mensagens WhatsApp</h1>
    <section className="rounded-card border border-line bg-surface p-5">
      <h2 className="font-semibold">Franquia do mês</h2>
      <p>{quota.used} de {quota.total} mensagens usadas</p>
      <progress className="w-full" value={Math.min(quota.used, quota.total)} max={quota.total} />
      {!quota.allowed ? <p className="text-danger">Franquia esgotada. Use o WhatsApp manual para lembrar seus clientes.</p> : quota.used >= quota.total * 0.8 ? <p>Você já usou 80% da franquia.</p> : null}
    </section>
    <form action={saveWhatsAppSettings} className="flex flex-col gap-4 rounded-card border border-line bg-surface p-5">
      <h2 className="font-semibold">Notificações automáticas</h2>
      {options.map((option) => <label key={option.key} className="flex min-h-11 items-center gap-3"><input type="checkbox" name={option.key} defaultChecked={option.checked} disabled={option.disabled} />{option.label}</label>)}
      {!twoHours ? <p className="text-sm text-ink-muted">O lembrete de 2 horas exige plano Profissional ou Studio.</p> : null}
      <button type="submit" className="min-h-11 rounded-field bg-primary px-4 text-white">Salvar preferências</button>
    </form>
  </div>;
}
