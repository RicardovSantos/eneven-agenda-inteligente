"use server";

import { revalidatePath } from "next/cache";
import { unstable_rethrow } from "next/navigation";
import { getDb } from "@/db/client";
import { completeOnboarding, skipOnboarding } from "@/server/onboarding";
import { requireOwner } from "@/server/settings/access";

export type FinishResult = { ok: boolean; error?: string };

const ERROR = "Não foi possível concluir agora. Tente novamente em instantes.";

async function finish(work: typeof completeOnboarding): Promise<FinishResult> {
  try {
    // Só o proprietário; o estabelecimento vem sempre da sessão.
    const session = await requireOwner();
    await work(await getDb(), session.tenantId);
    // O layout do painel muda de forma (volta o menu): precisa renderizar de novo.
    revalidatePath("/painel", "layout");
    return { ok: true };
  } catch (error) {
    unstable_rethrow(error);
    console.error("Falha ao concluir os primeiros passos", error);
    return { ok: false, error: ERROR };
  }
}

/** "Ir para a agenda": marca os primeiros passos como concluídos. */
export async function completeOnboardingAction(): Promise<FinishResult> {
  return finish(completeOnboarding);
}

/** "Fazer depois": pular conta como concluído. */
export async function skipOnboardingAction(): Promise<FinishResult> {
  return finish(skipOnboarding);
}
