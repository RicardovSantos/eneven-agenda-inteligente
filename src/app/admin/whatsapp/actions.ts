"use server";

import { revalidatePath } from "next/cache";
import { getDb } from "@/db/client";
import { requireSuperAdminSession } from "@/server/auth/guard";
import { resolveInboundEvent } from "@/server/whatsapp/webhook";
import { resolveOutboundQueue } from "@/server/whatsapp/queue";

export async function resolveWhatsAppEvent(form: FormData): Promise<void> {
  const session = await requireSuperAdminSession();
  const id = form.get("id");
  const resolution = form.get("resolution");
  if (typeof id !== "string" || !id || (resolution !== "completed" && resolution !== "retry")) throw new Error("Dados inválidos.");
  await resolveInboundEvent(await getDb(), id, session.userId, resolution);
  revalidatePath("/admin/whatsapp");
}

export async function resolveOutboundWhatsApp(form: FormData): Promise<void> {
  const session = await requireSuperAdminSession();
  const id = form.get("id");
  const tenantId = form.get("tenantId");
  const resolution = form.get("resolution");
  if (typeof id !== "string" || typeof tenantId !== "string" || !id || !tenantId || (resolution !== "completed" && resolution !== "retry")) throw new Error("Dados inválidos.");
  await resolveOutboundQueue(await getDb(), tenantId, id, session.userId, resolution);
  revalidatePath("/admin/whatsapp");
}
