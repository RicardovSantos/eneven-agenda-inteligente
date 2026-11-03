"use client";

import { Home, LogOut, ShieldCheck } from "lucide-react";
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

function Tabs({ pathname, className }: { pathname: string; className?: string }) {
  return (
    <nav aria-label="Plataforma" className={cn("flex gap-1", className)}>
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
  );
}

/**
 * Topo da administração (`docs/design/plano-3/Admin.dc.html`): faixa fina "Painel
 * administrativo" (o que se muda aqui vale para todos os estabelecimentos); logo à esquerda,
 * cápsula "Voltar Home" no centro (só para quem tem estabelecimento próprio) e o ícone de sair
 * sempre no canto direito de cima; as abas Estabelecimentos / Planos / Gerenciar.
 */
export function AdminHeader({ hasOwnTenant }: { hasOwnTenant: boolean }) {
  const pathname = usePathname();
  return (
    <div className="sticky top-0 z-30">
      <div
        role="note"
        aria-label="Painel administrativo: o que você muda aqui vale para todos os estabelecimentos"
        className="flex h-6 items-center justify-center gap-1.5 border-b border-primary/30 bg-primary-soft px-4 text-xs font-semibold text-primary"
      >
        <ShieldCheck className="size-3.5" aria-hidden="true" />
        Painel administrativo
      </div>
      <header className="border-b border-line bg-surface px-4 lg:px-8">
        <div className="grid min-h-16 grid-cols-[1fr_auto_1fr] items-center gap-x-3">
          <div className="flex min-w-0 items-center gap-7">
            <BrandLogo width={104} priority className="lg:hidden" />
            <BrandLogo width={124} priority className="hidden lg:inline-block" />
            <Tabs pathname={pathname} className="hidden lg:flex" />
          </div>
          <div className="flex justify-center">
            {hasOwnTenant ? (
              <Link
                href="/painel"
                title="Voltar para a home do meu estabelecimento"
                className="flex min-h-10 items-center gap-2 rounded-full bg-primary px-4 text-[0.9375rem] font-semibold text-primary-foreground shadow-sm outline-none transition-opacity hover:opacity-90 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
              >
                <Home className="size-[18px]" aria-hidden="true" />
                Voltar Home
              </Link>
            ) : null}
          </div>
          <form action="/sair" method="post" className="flex justify-end">
            <button
              type="submit"
              aria-label="Sair"
              title="Sair"
              className="flex size-11 cursor-pointer items-center justify-center rounded-field text-ink-muted outline-none hover:bg-primary-soft/60 hover:text-ink focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
            >
              <LogOut className="size-5" aria-hidden="true" />
            </button>
          </form>
        </div>
        <Tabs pathname={pathname} className="pb-1 lg:hidden" />
      </header>
    </div>
  );
}
