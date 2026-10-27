"use client";

import {
  CalendarDays,
  ChartNoAxesColumn,
  Ellipsis,
  Scissors,
  Settings,
  UserRound,
  Users,
  type LucideIcon,
} from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";

type NavItem = {
  label: string;
  icon: LucideIcon;
  /** Sem `href`, o item ainda não foi construído (aparece desabilitado). */
  href?: string;
};

const SIDEBAR_ITEMS: NavItem[] = [
  { label: "Agenda", icon: CalendarDays, href: "/painel" },
  { label: "Clientes", icon: Users, href: "/painel/clientes" },
  { label: "Serviços", icon: Scissors, href: "/painel/servicos" },
  { label: "Equipe", icon: UserRound, href: "/painel/equipe" },
  { label: "Painel", icon: ChartNoAxesColumn },
  { label: "Configurações", icon: Settings, href: "/painel/configuracoes" },
];

const BOTTOM_ITEMS: NavItem[] = [
  { label: "Agenda", icon: CalendarDays, href: "/painel" },
  { label: "Clientes", icon: Users, href: "/painel/clientes" },
  { label: "Painel", icon: ChartNoAxesColumn },
  { label: "Mais", icon: Ellipsis, href: "/painel/mais" },
];

function isActive(pathname: string, href: string) {
  // "Mais" também fica ativo nas telas que ele abre (Configurações, Serviços, Equipe).
  if (href === "/painel/mais") {
    return ["/painel/mais", "/painel/configuracoes", "/painel/servicos", "/painel/equipe"].some(
      (p) => pathname === p || pathname.startsWith(`${p}/`),
    );
  }
  // "Clientes" fica ativo também na ficha (/painel/clientes/{id}).
  if (href === "/painel/clientes") return pathname === href || pathname.startsWith(`${href}/`);
  return pathname === href;
}

export function SidebarNav() {
  const pathname = usePathname();
  return (
    <nav aria-label="Principal">
      <ul className="flex flex-col gap-1">
        {SIDEBAR_ITEMS.map(({ label, icon: Icon, href }) => {
          const active = href ? isActive(pathname, href) : false;
          const base =
            "flex h-11 items-center gap-3 rounded-field px-3 text-base";
          return (
            <li key={label}>
              {href ? (
                <Link
                  href={href}
                  aria-current={active ? "page" : undefined}
                  className={cn(
                    base,
                    active
                      ? "bg-primary-soft font-semibold text-primary"
                      : "font-medium text-ink hover:bg-primary-soft/60",
                  )}
                >
                  <Icon className="size-5" aria-hidden="true" />
                  {label}
                </Link>
              ) : (
                <span
                  aria-disabled="true"
                  className={cn(base, "cursor-not-allowed font-medium text-ink")}
                >
                  <Icon className="size-5 opacity-50" aria-hidden="true" />
                  <span className="flex-1 opacity-50">{label}</span>
                  <span className="rounded-full bg-canvas px-2 py-0.5 text-xs font-medium text-ink-muted">
                    Em breve
                  </span>
                </span>
              )}
            </li>
          );
        })}
      </ul>
    </nav>
  );
}

export function BottomNav() {
  const pathname = usePathname();
  return (
    <nav
      aria-label="Principal"
      className="fixed inset-x-0 bottom-0 z-20 border-t border-line bg-surface pb-[env(safe-area-inset-bottom)] lg:hidden"
    >
      <ul className="grid grid-cols-4">
        {BOTTOM_ITEMS.map(({ label, icon: Icon, href }) => {
          const active = href ? isActive(pathname, href) : false;
          const base =
            "flex min-h-14 flex-col items-center justify-center gap-0.5 px-2 text-[0.8125rem]";
          return (
            <li key={label}>
              {href ? (
                <Link
                  href={href}
                  aria-current={active ? "page" : undefined}
                  className={cn(
                    base,
                    active ? "font-semibold text-primary" : "font-medium text-ink",
                  )}
                >
                  <Icon className="size-6" aria-hidden="true" />
                  {label}
                </Link>
              ) : (
                <span aria-disabled="true" className={cn(base, "font-medium text-ink")}>
                  <Icon className="size-6 opacity-50" aria-hidden="true" />
                  <span className="opacity-50">{label}</span>
                  <span className="sr-only">(em breve)</span>
                </span>
              )}
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
