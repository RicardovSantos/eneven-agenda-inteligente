"use client";

import { ArrowRight, LogOut, Store } from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { BrandLogo } from "@/components/brand/logo";
import { cn } from "@/lib/utils";

const NAV = [
  { href: "/admin", label: "Estabelecimentos", match: (p: string) => p === "/admin" || p.startsWith("/admin/estabelecimentos") },
  { href: "/admin/planos", label: "Planos", match: (p: string) => p.startsWith("/admin/planos") },
  {
    href: "/admin/gerenciar",
    label: "Gerenciar",
    match: (p: string) => ["/admin/gerenciar", "/admin/whatsapp", "/admin/cobranca", "/admin/dados", "/admin/notificacoes"].some((base) => p.startsWith(base)),
  },
] as const;

const LINK =
  "flex min-h-10 items-center rounded-field px-3 text-[0.9375rem] outline-none focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent";

/**
 * Topo da plataforma (`docs/design/plano-3/Admin.dc.html`): faixa "Plataforma" (o que se
 * muda aqui vale para todos), logo, abas Estabelecimentos / Planos / Gerenciar, o botão para ir
 * ao próprio estabelecimento (só para quem tem um) e Sair.
 */
export function AdminHeader({ hasOwnTenant }: { hasOwnTenant: boolean }) {
  const pathname = usePathname();
  return (
    <div className="sticky top-0 z-30">
    <div
      role="note"
      aria-label="Você está na Plataforma"
      className="flex min-h-8 items-center justify-center bg-primary px-4 py-1 text-center text-[0.8125rem] font-semibold leading-snug text-primary-foreground lg:h-8 lg:px-8 lg:py-0"
    >
      PLATAFORMA · o que você muda aqui vale para todos os estabelecimentos
    </div>
    <header className="flex min-h-16 flex-wrap items-center gap-x-7 gap-y-1 border-b border-line bg-surface px-4 py-2 lg:px-8 lg:py-0">
      <BrandLogo width={124} priority />
      <nav aria-label="Plataforma" className="order-3 flex w-full gap-1 lg:order-none lg:w-auto">
          {NAV.map(({ href, label, match }) => {
            const active = match(pathname);
            return (
              <Link
                key={href}
                href={href}
                aria-current={active ? "page" : undefined}
                className={cn(
                  LINK,
                  "px-3.5",
                  active
                    ? "bg-primary-soft font-semibold text-primary"
                    : "font-medium text-ink-muted hover:bg-primary-soft/60 hover:text-ink",
                )}
              >
                {label}
              </Link>
            );
          })}
        </nav>
      <div className="ml-auto flex items-center gap-2">
        {hasOwnTenant ? (
          <Link
            href="/painel"
            title="Sair da Plataforma e abrir o painel do meu estabelecimento"
            className={cn(LINK, "gap-2 border border-line font-semibold text-primary hover:bg-primary-soft/60")}
          >
            <Store className="size-[18px]" aria-hidden="true" />
            Meu estabelecimento
            <ArrowRight className="size-4" aria-hidden="true" />
          </Link>
        ) : null}
        <form action="/sair" method="post">
          <button
            type="submit"
            className={cn(LINK, "cursor-pointer gap-2 font-medium text-ink hover:bg-primary-soft/60")}
          >
            <LogOut className="size-[18px]" aria-hidden="true" />
            Sair
          </button>
        </form>
      </div>
    </header>
    </div>
  );
}
