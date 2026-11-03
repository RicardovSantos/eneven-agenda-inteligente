import { ChevronRight, LogOut, ShieldCheck, type LucideIcon } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { CopyLinkButton } from "@/components/panel/copy-link-button";
import { PUBLIC_HOST } from "@/lib/brand";
import { moreItemsFor } from "@/lib/panel-nav";
import { requireOnboarded } from "@/server/panel/onboarding-gate";
import { isTenantReleased } from "@/server/tenants/release";

export const metadata: Metadata = { title: "Mais" };

const ROW =
  "flex min-h-14 items-center gap-3 px-4 text-base font-medium";

function NavRow({ href, icon: Icon, label }: { href: string; icon: LucideIcon; label: string }) {
  return (
    <Link href={href} className={`${ROW} hover:bg-primary-soft/60`}>
      <Icon className="size-5 text-ink-muted" aria-hidden="true" />
      <span className="flex-1">{label}</span>
      <ChevronRight className="size-5 text-ink-muted" aria-hidden="true" />
    </Link>
  );
}

export default async function MaisPage() {
  const data = await requireOnboarded();
  const allItems = moreItemsFor(data.session.role!, data.session.isSuperAdmin);
  const items = allItems.filter((item) => !item.admin);
  const adminItem = allItems.find((item) => item.admin);
  const released = isTenantReleased({
    status: data.tenantStatus,
    trialEndsAt: data.trialEndsAt,
    pastDueAt: data.pastDueAt,
    emailVerified: data.linkEmailVerified,
  });
  const link = `${PUBLIC_HOST}/${data.tenantSlug}`;

  return (
    <div className="mx-auto flex w-full max-w-[720px] flex-col gap-6">
      <h1 className="text-[1.75rem] font-semibold">Mais</h1>

      {items.length > 0 ? (
        <ul className="divide-y divide-line overflow-hidden rounded-panel border border-line bg-surface">
          {items.map((item) => (
            <li key={item.href}>
              <NavRow href={item.href} icon={item.icon} label={item.label} />
            </li>
          ))}
        </ul>
      ) : null}

      {adminItem ? (
        <section aria-label="Administração" className="flex flex-col gap-2">
          <Link
            href={adminItem.href}
            className="flex items-center gap-3.5 rounded-panel border border-primary bg-primary-soft p-4 no-underline transition-colors hover:bg-primary-soft/70"
          >
            <span className="grid size-11 shrink-0 place-items-center rounded-xl bg-primary text-primary-foreground" aria-hidden="true">
              <ShieldCheck className="size-6" />
            </span>
            <span className="flex min-w-0 flex-1 flex-col">
              <span className="text-base font-semibold text-primary">{adminItem.label}</span>
              <span className="text-[0.8125rem] leading-snug text-ink-muted">Painel administrativo · vale para todos os estabelecimentos</span>
            </span>
            <ChevronRight className="size-5 shrink-0 text-primary" aria-hidden="true" />
          </Link>
        </section>
      ) : null}

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
