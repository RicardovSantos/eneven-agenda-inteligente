"use server";

import { revalidatePath } from "next/cache";
import { getDb } from "@/db/client";
import { requireTenantSession } from "@/server/auth/guard";
import { googleCalendarEnabled } from "@/server/calendar/config";
import { disconnect, setConnectionEnabled } from "@/server/calendar/connections";

/** Cada pessoa mexe só na própria conexão: o `userId` vem da sessão, nunca do formulário. */
async function actor() {
  const session = await requireTenantSession();
  if (session.support) throw new Error("Indisponível no modo suporte.");
  return session;
}

/** Liga ou desliga o envio dos agendamentos para o Google Agenda (a conexão fica). */
export async function toggleCalendarAction(form: FormData): Promise<void> {
  const session = await actor();
  if (!googleCalendarEnabled()) return;
  await setConnectionEnabled(await getDb(), session.tenantId, session.userId, form.get("enabled") === "true");
  revalidatePath("/painel/integracoes");
}

/** Retira o acesso no Google e apaga a conexão. Os eventos já criados continuam na agenda da pessoa. */
export async function disconnectCalendarAction(): Promise<void> {
  const session = await actor();
  await disconnect(await getDb(), session.tenantId, session.userId);
  revalidatePath("/painel/integracoes");
}
