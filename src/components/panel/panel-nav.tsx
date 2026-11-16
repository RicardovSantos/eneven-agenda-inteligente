"use client";

import type { LucideIcon } from "lucide-react";
import Link, { useLinkStatus } from "next/link";
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
        {sidebar.map(({ label, icon: Icon, href, admin }) => {
          const active = isActive(pathname, href);
          const base =
            "flex h-11 items-center gap-3 rounded-field px-3 text-base";
          return (
            <li key={label} className={admin ? "mt-3 border-t border-line pt-4" : undefined}>
              <Link
                href={href}
                aria-current={active ? "page" : undefined}
                className={cn(
                  base,
                  admin
                    ? "border border-primary/50 bg-primary-soft font-semibold text-primary hover:bg-primary-soft/70"
                    : active
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

/**
 * Conteúdo de uma aba da barra inferior. Fica DENTRO do `<Link>` para `useLinkStatus` saber
 * quando esta aba foi tocada e a página ainda está carregando: o toque responde na hora
 * (a aba acende e pulsa) em vez de parecer que nada aconteceu até o servidor responder.
 */
function TabBody({
  icon: Icon,
  label,
  active,
}: {
  icon: LucideIcon;
  label: string;
  active: boolean;
}) {
  const { pending } = useLinkStatus();
  const lit = active || pending;
  return (
    <>
      <span
        className={cn(
          "grid h-8 w-16 place-items-center rounded-full transition-colors",
          lit ? "bg-primary-soft text-primary" : "text-ink",
          pending && "motion-safe:animate-pulse",
        )}
      >
        <Icon className="size-[26px]" aria-hidden="true" />
      </span>
      <span className={cn("text-sm", lit ? "font-semibold text-primary" : "font-medium text-ink")}>
        {label}
      </span>
    </>
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
        {bottom.map(({ label, icon, href }) => {
          const active = isActive(pathname, href);
          return (
            <li key={label}>
              <Link
                href={href}
                aria-current={active ? "page" : undefined}
                // `touch-manipulation`: o iOS não trata dois toques seguidos como zoom (que engole o toque).
                className="flex min-h-[4.25rem] touch-manipulation select-none flex-col items-center justify-center gap-1 px-2 [-webkit-tap-highlight-color:transparent] active:bg-primary-soft/50"
              >
                <TabBody icon={icon} label={label} active={active} />
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
