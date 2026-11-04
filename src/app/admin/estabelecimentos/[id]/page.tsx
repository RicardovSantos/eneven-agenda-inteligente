import type { Metadata } from "next";
import { ChevronLeft } from "lucide-react";
import Link from "next/link";
import { notFound } from "next/navigation";
import { getDb } from "@/db/client";
import { EnterSupportButton } from "@/components/platform/enter-support-button";
import { BillingIdsCard } from "@/components/platform/billing-ids-card";
import { OwnerCard } from "@/components/platform/owner-card";
import { SituationBadge } from "@/components/platform/situation-badge";
import { SubscriptionCard } from "@/components/platform/subscription-card";
import { HistoryCard, UsageCard } from "@/components/platform/usage-history";
import { buttonVariants } from "@/components/ui/button";
import { PUBLIC_HOST } from "@/lib/brand";
import { formatBrazilPhone, normalizeBrazilPhone } from "@/lib/phone";
import {
  avatarColor,
  formatDayMonthBR,
  formatFullDateBR,
  formatLastSeen,
  initialsOf,
} from "@/lib/platform-format";
import { cn } from "@/lib/utils";
import { buildWhatsAppLink, firstName } from "@/lib/whatsapp";
import { requireSuperAdminSession } from "@/server/auth/guard";
import { listPlans } from "@/server/platform/plans";
import { getTenantBillingIds } from "@/server/platform/billing-ids";
import { getPlatformTenant } from "@/server/platform/tenants";

export const metadata: Metadata = { title: "Estabelecimento" };

const DAY_MS = 86_400_000;

function trialLine(
  tenant: NonNullable<Awaited<ReturnType<typeof getPlatformTenant>>>,
  now: Date,
): { label: string; value: string } | null {
  const date = formatFullDateBR(tenant.trialEndsAt);
  if (tenant.situation === "trial") {
    const days = Math.max(1, Math.ceil((tenant.trialEndsAt.getTime() - now.getTime()) / DAY_MS));
    return { label: "Teste termina", value: `${date}, em ${days} ${days === 1 ? "dia" : "dias"}` };
  }
  if (tenant.situation === "trial_expired") return { label: "Teste terminou", value: date };
  if (tenant.activatedAt) return { label: "Ativo desde", value: formatFullDateBR(tenant.activatedAt) };
  return null;
}

/** Ficha de um estabelecimento: assinatura, dono, uso e histórico. */
export default async function AdminTenantPage({ params }: PageProps<"/admin/estabelecimentos/[id]">) {
  await requireSuperAdminSession();
  const { id } = await params;
  const db = await getDb();
  const now = new Date();
  const [tenant, plans] = await Promise.all([getPlatformTenant(db, id, now), listPlans(db)]);
  if (!tenant) notFound();
  const billingIds = await getTenantBillingIds(db, tenant.id);

  const publicPath = `${PUBLIC_HOST}/${tenant.slug}`;
  const wa = tenant.whatsapp ? normalizeBrazilPhone(tenant.whatsapp) : null;
  const owner = tenant.owner;
  const createdByAdmin = tenant.audit.some((row) => row.action === "tenant.created_by_admin");
  const eligibleTrial =
    tenant.status === "trial" || (tenant.status === "read_only" && tenant.activatedAt === null);

  return (
    <main className="mx-auto flex w-full max-w-[1180px] flex-col gap-5 px-4 pb-10 pt-4 lg:px-8 lg:pt-5">
      <Link
        href="/admin"
        className="flex min-h-10 w-fit items-center gap-1 text-[0.9375rem] font-medium text-ink-muted no-underline hover:text-ink"
      >
        <ChevronLeft className="size-[18px]" aria-hidden="true" />
        Estabelecimentos
      </Link>

      <div className="flex flex-wrap items-center justify-between gap-4">
        <div className="flex min-w-0 items-center gap-4">
          <span
            aria-hidden="true"
            className="grid size-14 flex-none place-items-center rounded-panel font-display text-xl font-bold text-white"
            style={{ backgroundColor: avatarColor(tenant.slug) }}
          >
            {initialsOf(tenant.name)}
          </span>
          <div className="flex min-w-0 flex-col gap-1">
            <div className="flex flex-wrap items-center gap-x-2.5 gap-y-1">
              <h1 className="font-display text-[1.75rem] font-semibold leading-tight">{tenant.name}</h1>
              <SituationBadge situation={tenant.situation} />
            </div>
            <a
              href={`https://${publicPath}`}
              target="_blank"
              rel="noopener noreferrer"
              className="break-all text-[0.9375rem] text-primary"
            >
              {publicPath}
            </a>
          </div>
        </div>
        <div className="flex flex-wrap gap-2.5">
          <a
            href={`https://${publicPath}`}
            target="_blank"
            rel="noopener noreferrer"
            className={cn(buttonVariants({ variant: "outline" }), "px-4 text-[0.9375rem]")}
          >
            Abrir página
          </a>
          <EnterSupportButton tenantId={tenant.id} />
        </div>
      </div>

      <div className="grid grid-cols-[repeat(auto-fit,minmax(min(100%,340px),1fr))] items-start gap-4">
        <SubscriptionCard
          tenantId={tenant.id}
          tenantName={tenant.name}
          status={tenant.status}
          situation={tenant.situation}
          planId={tenant.plan.id}
          plans={plans
            .filter((p) => p.active || p.id === tenant.plan.id)
            .map((p) => ({
              id: p.id,
              name: p.name,
              priceCents: p.priceCents,
              maxProfessionals: p.maxProfessionals,
              active: p.active,
            }))}
          trialLine={trialLine(tenant, now)}
          signupLine={`${formatFullDateBR(tenant.createdAt)}${createdByAdmin ? ", pela plataforma" : ""}`}
          canExtendTrial={eligibleTrial}
        />

        <div className="flex flex-col gap-4">
          <OwnerCard
            tenantId={tenant.id}
            owner={
              owner
                ? {
                    name: owner.name,
                    email: owner.email,
                    emailVerified: owner.emailVerified,
                    whatsappLabel: tenant.whatsapp ? formatBrazilPhone(tenant.whatsapp) : null,
                    lastSeen: formatLastSeen(owner.lastLoginAt, now),
                  }
                : null
            }
            whatsappUrl={
              wa && owner ? buildWhatsAppLink(wa, `Olá, ${firstName(owner.name)}! Tudo bem?`) : null
            }
            canSendAccess={owner !== null && !owner.hasPassword}
            inviteSentOn={tenant.pendingOwnerInvite ? formatDayMonthBR(tenant.pendingOwnerInvite.sentAt) : null}
          />
          <UsageCard usage={tenant.usage} />
        </div>
      </div>

      <BillingIdsCard tenantId={tenant.id} ids={billingIds} />

      <HistoryCard rows={tenant.audit} />
    </main>
  );
}
