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
  { label: "Clientes", icon: Users },
  { label: "Serviços", icon: Scissors },
  { label: "Equipe", icon: UserRound },
  { label: "Painel", icon: ChartNoAxesColumn },
  { label: "Configurações", icon: Settings },
];

const BOTTOM_ITEMS: NavItem[] = [
  { label: "Agenda", icon: CalendarDays, href: "/painel" },
  { label: "Clientes", icon: Users },
  { label: "Painel", icon: ChartNoAxesColumn },
  { label: "Mais", icon: Ellipsis },
];

function isActive(pathname: string, href: string) {
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
                  title="Em breve"
                  className={cn(base, "cursor-not-allowed font-medium text-ink opacity-50")}
                >
                  <Icon className="size-5" aria-hidden="true" />
                  {label}
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
                <span
                  aria-disabled="true"
                  title="Em breve"
                  className={cn(base, "font-medium text-ink opacity-50")}
                >
                  <Icon className="size-6" aria-hidden="true" />
                  {label}
                </span>
              )}
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
