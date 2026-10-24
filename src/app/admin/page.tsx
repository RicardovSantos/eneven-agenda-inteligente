import type { Metadata } from "next";
import { LogOut } from "lucide-react";
import { BrandLogo } from "@/components/brand/logo";
import { requireSuperAdminSession } from "@/server/auth/guard";

export const metadata: Metadata = { title: "Painel da plataforma" };

/** Área da plataforma (super-admin). Só a casca por enquanto. */
export default async function AdminPage() {
  await requireSuperAdminSession();

  return (
    <div className="min-h-dvh bg-canvas">
      <header className="flex h-14 items-center justify-between gap-3 border-b border-line bg-surface pl-4 pr-1 lg:px-8">
        <BrandLogo width={132} priority />
        <form action="/sair" method="post">
          <button
            type="submit"
            className="flex h-11 items-center gap-2 rounded-field px-3 text-base font-medium text-ink transition-colors hover:bg-primary-soft/60 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
          >
            <LogOut className="size-5" aria-hidden="true" />
            Sair
          </button>
        </form>
      </header>

      <main className="px-4 pb-10 pt-6 lg:px-8 lg:pt-8">
        <h1 className="text-[1.75rem] font-semibold">Painel da plataforma</h1>
        <p className="mt-1 max-w-[60ch] text-ink-muted">
          Em construção. Aqui você vai gerenciar os estabelecimentos, planos e assinaturas.
        </p>
        <div className="fio mt-8 w-40" />
      </main>
    </div>
  );
}
