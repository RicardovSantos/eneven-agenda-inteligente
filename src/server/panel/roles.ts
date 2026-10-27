import { redirect } from "next/navigation";
import type { PanelRole } from "@/lib/panel-nav";
import { requireOnboarded } from "./onboarding-gate";

/**
 * Guarda de papel das páginas do painel: exige estabelecimento configurado
 * (`requireOnboarded`) e manda para `/painel` quem não tem um dos papéis
 * permitidos. Devolve os dados do painel (como `requireOnboarded`).
 */
export async function requirePanelRole(allowed: PanelRole[]) {
  const data = await requireOnboarded();
  if (!data.session.role || !allowed.includes(data.session.role)) redirect("/painel");
  return data;
}
