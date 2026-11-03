import { Building2, LogOut } from "lucide-react";
import Link from "next/link";
import type { ReactNode } from "react";
import { BrandLogo } from "@/components/brand/logo";
import { SidebarLink } from "./copy-link-button";
import type { PanelRole } from "@/lib/panel-nav";
import { BottomNav, SidebarNav } from "./panel-nav";

/** `<form>` de logout: o `/sair` só aceita POST. */
function LogoutForm({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <form action="/sair" method="post" className={className}>
      {children}
    </form>
  );
}

/** Selo "SUPORTE": a conta aberta é a de um cliente, não a do próprio usuário. */
function SupportTag() {
  return (
    <span className="mb-0.5 inline-block w-fit shrink-0 rounded-md bg-amber-400 px-1.5 py-0.5 text-[0.6875rem] font-bold uppercase leading-none tracking-wide text-neutral-900">
      Suporte
    </span>
  );
}

/** Para o super-admin: esta tela é do estabelecimento dele (a Plataforma, que vale para todos, é outra). */
function OwnTenantTag() {
  return (
    <span className="mb-0.5 inline-block w-fit shrink-0 rounded-md bg-primary-soft px-1.5 py-0.5 text-[0.6875rem] font-bold uppercase leading-none tracking-wide text-primary">
      Meu estabelecimento
    </span>
  );
}

/**
 * Casca definitiva do painel: barra lateral de 232px em telas largas; topo
 * com o nome do estabelecimento e navegação inferior no celular.
 */
export function PanelShell({
  userName,
  tenantName,
  publicLink,
  role,
  isSuperAdmin,
  notice,
  support = false,
  children,
}: {
  /** Super-admin dentro do estabelecimento ("entrou como"): mostra o rótulo SUPORTE no menu e no topo. */
  support?: boolean;
  userName: string;
  tenantName: string;
  /** Link público do salão quando liberado (e-mail confirmado e conta ativa/em teste); senão `null`. */
  publicLink: { label: string; url: string } | null;
  role: PanelRole;
  isSuperAdmin: boolean;
  /** Faixa de aviso (somente leitura) entre o topo e o conteúdo, de ponta a ponta. */
  notice?: ReactNode;
  children: ReactNode;
}) {
  return (
    <div className="min-h-dvh bg-canvas lg:flex">
      {/* Barra lateral (>= 1024px): fica no topo da janela; rola por dentro se precisar */}
      <aside className="sticky top-0 z-20 hidden h-dvh w-[232px] shrink-0 flex-col self-start border-r border-line bg-surface lg:flex">
        <div className="px-4 pb-6 pt-6">
          <BrandLogo width={132} />
        </div>
        <div className="flex-1 overflow-y-auto px-3">
          <SidebarNav role={role} isSuperAdmin={isSuperAdmin} />
        </div>
        <div className="flex flex-col gap-3 border-t border-line p-4">
          <SidebarLink label={publicLink?.label ?? ""} url={publicLink?.url ?? null} />
          <div className="min-w-0 pt-1">
            {support ? <SupportTag /> : isSuperAdmin ? <OwnTenantTag /> : null}
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

      <div className="min-w-0 flex-1">
      {/* Topo (celular) */}
      <header className="sticky top-0 z-20 flex h-14 items-center justify-between gap-3 border-b border-line bg-surface pl-4 pr-1 lg:hidden">
        <p className="flex min-w-0 flex-col items-start justify-center font-display text-lg font-semibold leading-tight">
          {support ? <SupportTag /> : isSuperAdmin ? <OwnTenantTag /> : null}
          <span className="max-w-full truncate">{tenantName}</span>
        </p>
        <div className="flex shrink-0 items-center">
        {isSuperAdmin && !support ? (
          <Link
            href="/admin"
            aria-label="Ir para a Plataforma"
            title="Ir para a Plataforma (vale para todos os estabelecimentos)"
            className="flex size-11 items-center justify-center rounded-field text-primary hover:bg-primary-soft/60"
          >
            <Building2 className="size-5" aria-hidden="true" />
          </Link>
        ) : null}
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
        </div>
      </header>

      {notice}

      <main className="px-4 pb-28 pt-6 lg:px-8 lg:pb-10 lg:pt-8">{children}</main>
      </div>

      <BottomNav role={role} isSuperAdmin={isSuperAdmin} />
    </div>
  );
}
