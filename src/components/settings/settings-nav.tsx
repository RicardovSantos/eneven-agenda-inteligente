import { ChevronRight } from "lucide-react";
import Link from "next/link";
import type { ComponentType, ReactNode } from "react";

/** Moldura de uma tela de configuração: voltar, título e conteúdo. */
export function SettingsPageShell({
  title,
  description,
  children,
}: {
  title: string;
  description?: string;
  children: ReactNode;
}) {
  return (
    <div className="mx-auto flex w-full max-w-[720px] flex-col gap-6">
      <div className="flex flex-col gap-2">
        <Link href="/painel/configuracoes" className="text-sm text-primary">
          ‹ Configurações
        </Link>
        <h1 className="text-[1.75rem] font-semibold">{title}</h1>
        {description ? <p className="m-0 text-ink-muted">{description}</p> : null}
      </div>
      {children}
    </div>
  );
}

/** Grupo de linhas no estilo "Ajustes": cartão com divisórias e um título pequeno acima. */
export function SettingsGroup({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section aria-label={title} className="flex flex-col gap-2">
      <h2 className="m-0 px-1 text-sm font-semibold text-ink-muted">{title}</h2>
      <ul className="m-0 flex list-none flex-col overflow-hidden rounded-panel border border-line bg-surface p-0">
        {children}
      </ul>
    </section>
  );
}

/** Uma linha do grupo: ícone, nome, frase curta e seta. Leva à tela da categoria. */
export function SettingsRow({
  href,
  label,
  description,
  Icon,
}: {
  href: string;
  label: string;
  description: string;
  Icon: ComponentType<{ className?: string }>;
}) {
  return (
    <li className="border-b border-line/60 last:border-b-0">
      <Link
        href={href}
        className="flex min-h-[4.25rem] items-center gap-3.5 px-4 py-3 text-foreground no-underline transition-colors hover:bg-primary-soft/60"
      >
        <span className="grid size-10 shrink-0 place-items-center rounded-xl bg-primary-soft text-primary" aria-hidden="true">
          <Icon className="size-5" />
        </span>
        <span className="flex min-w-0 flex-1 flex-col">
          <span className="font-semibold">{label}</span>
          <span className="text-[0.8125rem] leading-snug text-ink-muted">{description}</span>
        </span>
        <ChevronRight className="size-5 shrink-0 text-ink-muted" aria-hidden="true" />
      </Link>
    </li>
  );
}
