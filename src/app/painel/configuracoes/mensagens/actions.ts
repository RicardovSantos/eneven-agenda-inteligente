"use server";

import { eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { getDb } from "@/db/client";
import { plans, tenantNotificationSettings, tenants } from "@/db/schema";
import { requireOwner } from "@/server/settings/access";
import { withTenant } from "@/server/tenant-db";

export async function saveWhatsAppSettings(form: FormData): Promise<void> {
  const actor = await requireOwner();
  const db = await getDb();
  const [tenant] = await db.select({ code: plans.code }).from(tenants).innerJoin(plans, eq(plans.id, tenants.planId)).where(eq(tenants.id, actor.tenantId)).limit(1);
  if (!tenant) throw new Error("Estabelecimento não encontrado.");
  const reminder2h = form.get("reminder2h") === "on";
  if (reminder2h && !["profissional", "studio"].includes(tenant.code)) throw new Error("Lembrete de 2 horas exige plano Profissional ou Studio.");
  const values = { bookingCreated: form.get("bookingCreated") === "on", reminderEve: form.get("reminderEve") === "on", reminder2h, rescheduled: form.get("rescheduled") === "on", canceled: form.get("canceled") === "on", updatedAt: new Date() };
  await withTenant(db, actor.tenantId, (tx) => tx.insert(tenantNotificationSettings).values({ tenantId: actor.tenantId, ...values })
    .onConflictDoUpdate({ target: tenantNotificationSettings.tenantId, set: values }));
  revalidatePath("/painel/configuracoes/mensagens");
  revalidatePath("/painel/visao-geral");
}
