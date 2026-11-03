import {
  CalendarDays,
  ChartNoAxesColumn,
  Ellipsis,
  Scissors,
  Settings,
  ShieldCheck,
  UserRound,
  Users,
  type LucideIcon,
} from "lucide-react";

export type PanelRole = "owner" | "reception" | "staff";

export type NavItem = {
  label: string;
  icon: LucideIcon;
  href: string;
  /** Área administrativa da Eneven (vale para todos os estabelecimentos): aparece separada e em destaque. */
  admin?: true;
};

const AGENDA: NavItem = { label: "Agenda", icon: CalendarDays, href: "/painel" };
const CLIENTES: NavItem = { label: "Clientes", icon: Users, href: "/painel/clientes" };
const SERVICOS: NavItem = { label: "Serviços", icon: Scissors, href: "/painel/servicos" };
const EQUIPE: NavItem = { label: "Equipe", icon: UserRound, href: "/painel/equipe" };
const PAINEL: NavItem = { label: "Painel", icon: ChartNoAxesColumn, href: "/painel/visao-geral" };
const CONFIG: NavItem = { label: "Configurações", icon: Settings, href: "/painel/configuracoes" };
const MAIS: NavItem = { label: "Mais", icon: Ellipsis, href: "/painel/mais" };
const PLATAFORMA: NavItem = { label: "Administração Eneven", icon: ShieldCheck, href: "/admin", admin: true };

/**
 * Menu do painel por papel (docs/design/telas/plano-3.md): proprietário vê tudo;
 * recepção, Serviços e Equipe só para leitura; profissional, só Agenda e Clientes.
 * Super-admin com estabelecimento próprio ganha "Administração Eneven" no fim do menu lateral, separada das demais.
 * No celular, quem não é proprietário fica com Agenda, Clientes e Mais.
 */
export function navItemsFor(
  role: PanelRole,
  isSuperAdmin: boolean,
): { sidebar: NavItem[]; bottom: NavItem[] } {
  const sidebar =
    role === "owner"
      ? [AGENDA, CLIENTES, SERVICOS, EQUIPE, PAINEL, CONFIG]
      : role === "reception"
        ? [AGENDA, CLIENTES, SERVICOS, EQUIPE]
        : [AGENDA, CLIENTES];
  const bottom = role === "owner" ? [AGENDA, CLIENTES, PAINEL, MAIS] : [AGENDA, CLIENTES, MAIS];
  return { sidebar: isSuperAdmin ? [...sidebar, PLATAFORMA] : sidebar, bottom };
}

/** Itens da tela "Mais": o que não cabe na navegação inferior. */
export function moreItemsFor(role: PanelRole, isSuperAdmin: boolean): NavItem[] {
  const { sidebar, bottom } = navItemsFor(role, isSuperAdmin);
  const inBottom = new Set(bottom.map((i) => i.href));
  return sidebar.filter((i) => !inBottom.has(i.href));
}
