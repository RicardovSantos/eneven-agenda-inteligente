"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { navItemsFor, type PanelRole } from "@/lib/panel-nav";
import { cn } from "@/lib/utils";

function isActive(pathname: string, href: string) {
  // "Mais" também fica ativo nas telas que ele abre (Configurações, Serviços, Equipe).
  if (href === "/painel/mais") {
    return ["/painel/mais", "/painel/configuracoes", "/painel/servicos", "/painel/equipe"].some(
      (p) => pathname === p || pathname.startsWith(`${p}/`),
    );
  }
  // "Clientes" fica ativo também na ficha (/painel/clientes/{id}).
  if (href === "/painel/clientes") return pathname === href || pathname.startsWith(`${href}/`);
  if (href === "/admin") return pathname === href || pathname.startsWith(`${href}/`);
  return pathname === href;
}

export function SidebarNav({ role, isSuperAdmin }: { role: PanelRole; isSuperAdmin: boolean }) {
  const pathname = usePathname();
  const { sidebar } = navItemsFor(role, isSuperAdmin);
  return (
    <nav aria-label="Principal">
      <ul className="flex flex-col gap-1">
        {sidebar.map(({ label, icon: Icon, href }) => {
          const active = isActive(pathname, href);
          const base =
            "flex h-11 items-center gap-3 rounded-field px-3 text-base";
          return (
            <li key={label}>
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
            </li>
          );
        })}
      </ul>
    </nav>
  );
}

export function BottomNav({ role, isSuperAdmin }: { role: PanelRole; isSuperAdmin: boolean }) {
  const pathname = usePathname();
  const { bottom } = navItemsFor(role, isSuperAdmin);
  return (
    <nav
      aria-label="Principal"
      className="fixed inset-x-0 bottom-0 z-20 border-t border-line bg-surface pb-[env(safe-area-inset-bottom)] lg:hidden"
    >
      <ul className={bottom.length === 4 ? "grid grid-cols-4" : "grid grid-cols-3"}>
        {bottom.map(({ label, icon: Icon, href }) => {
          const active = isActive(pathname, href);
          const base =
            "flex min-h-14 flex-col items-center justify-center gap-0.5 px-2 text-[0.8125rem]";
          return (
            <li key={label}>
              <Link
                href={href}
                aria-current={active ? "page" : undefined}
                className={cn(base, active ? "font-semibold text-primary" : "font-medium text-ink")}
              >
                <Icon className="size-6" aria-hidden="true" />
                {label}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
