import { redirect } from "next/navigation";
import { onboardingRedirect } from "@/server/onboarding";
import { getPanelData } from "./data";

/**
 * Entrada das páginas do painel (exceto `/painel/comecar`): o proprietário que
 * ainda não concluiu nem pulou os primeiros passos vai para o assistente.
 * Devolve os mesmos dados de `getPanelData` (uma consulta por requisição).
 *
 * Fica nas páginas e não no layout de propósito: um layout não é renderizado de
 * novo a cada navegação interna do App Router (o resultado fica guardado) e um
 * `redirect()` lançado nele durante a navegação deixa o roteador em laço.
 */
export async function requireOnboarded() {
  const data = await getPanelData();
  const target = onboardingRedirect({
    role: data.session.role,
    completed: data.onboardingCompletedAt !== null,
    page: "panel",
  });
  if (target) redirect(target);
  return data;
}
