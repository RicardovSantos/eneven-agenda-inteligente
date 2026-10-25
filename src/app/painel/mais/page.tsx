import { ChevronRight, LogOut, Scissors, Settings, UserRound, type LucideIcon } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { CopyLinkButton } from "@/components/panel/copy-link-button";
import { PUBLIC_HOST } from "@/lib/brand";
import { getPanelData } from "@/server/panel/data";

export const metadata: Metadata = { title: "Mais" };

const ROW =
  "flex min-h-14 items-center gap-3 px-4 text-base font-medium";

function NavRow({
  href,
  icon: Icon,
  label,
  enabled = true,
}: {
  href: string;
  icon: LucideIcon;
  label: string;
  enabled?: boolean;
}) {
  const content = (
    <>
      <Icon className="size-5 text-ink-muted" aria-hidden="true" />
      <span className="flex-1">{label}</span>
      <ChevronRight className="size-5 text-ink-muted" aria-hidden="true" />
    </>
  );
  return enabled ? (
    <Link href={href} className={`${ROW} hover:bg-primary-soft/60`}>
      {content}
    </Link>
  ) : (
    <span aria-disabled="true" title="Só o proprietário" className={`${ROW} cursor-not-allowed opacity-50`}>
      {content}
    </span>
  );
}

export default async function MaisPage() {
  const data = await getPanelData();
  const isOwner = data.session.role === "owner";
  const released =
    data.session.emailVerified &&
    (data.tenantStatus === "trial" || data.tenantStatus === "active");
  const link = `${PUBLIC_HOST}/${data.tenantSlug}`;

  return (
    <div className="mx-auto flex w-full max-w-[720px] flex-col gap-6">
      <h1 className="text-[1.75rem] font-semibold">Mais</h1>

      <ul className="divide-y divide-line overflow-hidden rounded-panel border border-line bg-surface">
        <li>
          <NavRow href="/painel/servicos" icon={Scissors} label="Serviços" />
        </li>
        <li>
          <NavRow href="/painel/equipe" icon={UserRound} label="Equipe" />
        </li>
        <li>
          <NavRow
            href="/painel/configuracoes"
            icon={Settings}
            label="Configurações"
            enabled={isOwner}
          />
        </li>
      </ul>

      <section
        aria-labelledby="link-title"
        className="flex flex-col gap-3 rounded-panel border border-line bg-surface p-4"
      >
        <h2 id="link-title" className="text-base font-semibold">
          Seu link de agendamento
        </h2>
        {released ? (
          <div className="flex items-center gap-3">
            <p className="min-w-0 flex-1 break-all rounded-field bg-canvas px-3 py-2.5 text-sm font-medium">
              {link}
            </p>
            <CopyLinkButton url={`https://${link}`} />
          </div>
        ) : (
          <p className="text-sm leading-snug text-ink-muted">
            Confirme seu e-mail para liberar seu link.
          </p>
        )}
      </section>

      <form action="/sair" method="post">
        <button
          type="submit"
          className={`${ROW} w-full overflow-hidden rounded-panel border border-line bg-surface text-[#C2410C] hover:bg-danger-soft dark:text-danger`}
        >
          <LogOut className="size-5" aria-hidden="true" />
          Sair
        </button>
      </form>
    </div>
  );
}
