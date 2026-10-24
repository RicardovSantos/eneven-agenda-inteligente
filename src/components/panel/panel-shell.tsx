import { LogOut } from "lucide-react";
import type { ReactNode } from "react";
import { BrandLogo } from "@/components/brand/logo";
import { BottomNav, SidebarNav } from "./panel-nav";

/** `<form>` de logout: o `/sair` só aceita POST. */
function LogoutForm({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <form action="/sair" method="post" className={className}>
      {children}
    </form>
  );
}

/**
 * Casca definitiva do painel: barra lateral de 232px em telas largas; topo
 * com o nome do estabelecimento e navegação inferior no celular.
 */
export function PanelShell({
  userName,
  tenantName,
  children,
}: {
  userName: string;
  tenantName: string;
  children: ReactNode;
}) {
  return (
    <div className="min-h-dvh bg-canvas">
      {/* Barra lateral (>= 1024px) */}
      <aside className="fixed inset-y-0 left-0 z-20 hidden w-[232px] flex-col border-r border-line bg-surface lg:flex">
        <div className="px-4 pb-6 pt-6">
          <BrandLogo width={132} />
        </div>
        <div className="flex-1 overflow-y-auto px-3">
          <SidebarNav />
        </div>
        <div className="flex flex-col gap-3 border-t border-line p-4">
          <div className="min-w-0">
            <p className="truncate font-semibold leading-snug">{userName}</p>
            <p className="truncate text-sm leading-snug text-ink-muted">{tenantName}</p>
          </div>
          <LogoutForm>
            <button
              type="submit"
              className="flex h-11 w-full items-center gap-3 rounded-field px-3 text-base font-medium text-ink transition-colors hover:bg-primary-soft/60"
            >
              <LogOut className="size-5" aria-hidden="true" />
              Sair
            </button>
          </LogoutForm>
        </div>
      </aside>

      {/* Topo (celular) */}
      <header className="sticky top-0 z-20 flex h-14 items-center justify-between gap-3 border-b border-line bg-surface pl-4 pr-1 lg:hidden">
        <p className="truncate font-display text-lg font-semibold">{tenantName}</p>
        <LogoutForm>
          <button
            type="submit"
            aria-label="Sair"
            title="Sair"
            className="flex size-11 items-center justify-center rounded-field text-ink-muted hover:text-foreground"
          >
            <LogOut className="size-5" aria-hidden="true" />
          </button>
        </LogoutForm>
      </header>

      <div className="lg:pl-[232px]">
        <main className="px-4 pb-28 pt-6 lg:px-8 lg:pb-10 lg:pt-8">{children}</main>
      </div>

      <BottomNav />
    </div>
  );
}
