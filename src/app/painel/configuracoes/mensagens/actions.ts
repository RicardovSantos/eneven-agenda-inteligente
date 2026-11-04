"use server";

import { eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { unstable_rethrow } from "next/navigation";
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

export type WhatsAppSettingsState = { message?: string; error?: string; at?: number };

/**
 * Versão do formulário da tela: devolve "Preferências salvas" ou o motivo do erro, para a tela
 * mostrar o aviso (antes o botão não dava nenhum retorno e um erro caía numa página genérica).
 */
export async function saveWhatsAppSettingsAction(_previous: WhatsAppSettingsState, form: FormData): Promise<WhatsAppSettingsState> {
  try {
    await saveWhatsAppSettings(form);
    return { message: "Preferências salvas", at: Date.now() };
  } catch (error) {
    // Redirecionamentos (sessão perdida, acesso negado) seguem o caminho normal do Next.
    unstable_rethrow(error);
    const text = error instanceof Error ? error.message : "";
    return { error: /Profissional ou Studio/.test(text) ? text : "Não foi possível salvar agora. Tente novamente.", at: Date.now() };
  }
}

const OPTION_KEYS = ["bookingCreated", "reminderEve", "reminder2h", "rescheduled", "canceled"] as const;
export type WhatsAppOptionKey = (typeof OPTION_KEYS)[number];

/** Liga ou desliga uma mensagem e salva na hora; as outras preferências não mudam. */
export async function setWhatsAppOptionAction(key: string, enabled: boolean): Promise<{ ok: boolean; error?: string }> {
  try {
    if (!(OPTION_KEYS as readonly string[]).includes(key)) return { ok: false, error: "Preferência inválida." };
    const actor = await requireOwner();
    const db = await getDb();
    const [tenant] = await db.select({ code: plans.code }).from(tenants).innerJoin(plans, eq(plans.id, tenants.planId)).where(eq(tenants.id, actor.tenantId)).limit(1);
    if (!tenant) return { ok: false, error: "Estabelecimento não encontrado." };
    if (key === "reminder2h" && enabled && !["profissional", "studio"].includes(tenant.code)) {
      return { ok: false, error: "Lembrete de 2 horas exige plano Profissional ou Studio." };
    }
    const values = { [key]: enabled, updatedAt: new Date() };
    await withTenant(db, actor.tenantId, (tx) => tx.insert(tenantNotificationSettings).values({ tenantId: actor.tenantId, ...values })
      .onConflictDoUpdate({ target: tenantNotificationSettings.tenantId, set: values }));
    revalidatePath("/painel/configuracoes/mensagens");
    revalidatePath("/painel/visao-geral");
    return { ok: true };
  } catch (error) {
    unstable_rethrow(error);
    return { ok: false, error: "Não foi possível salvar agora. Tente novamente." };
  }
}
