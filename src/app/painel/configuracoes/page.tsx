import { eq } from "drizzle-orm";
import Link from "next/link";
import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { getDb } from "@/db/client";
import { tenants } from "@/db/schema";
import { BrandForm } from "@/components/settings/brand-form";
import { BusinessInfoForm } from "@/components/settings/business-info-form";
import { HoursForm } from "@/components/settings/hours-form";
import { RulesForm } from "@/components/settings/rules-form";
import { SlugForm } from "@/components/settings/slug-form";
import { TeamAccessCard } from "@/components/settings/team-access-card";
import { requirePanelRole } from "@/server/panel/roles";
import { defaultApplyToTeam, getBusinessHours } from "@/server/settings";
import { listInvitableProfessionals, listTeamAccess } from "@/server/team/members";

export const metadata: Metadata = { title: "Configurações" };

export default async function ConfiguracoesPage() {
  const { session } = await requirePanelRole(["owner"]);

  const db = await getDb();
  const [tenant] = await db
    .select()
    .from(tenants)
    .where(eq(tenants.id, session.tenantId))
    .limit(1);
  if (!tenant) redirect("/entrar");
  const hours = await getBusinessHours(db, session.tenantId);
  const applyToTeamDefault = await defaultApplyToTeam(db, session.tenantId);
  const [team, invitable] = await Promise.all([
    listTeamAccess(db, session.tenantId),
    listInvitableProfessionals(db, session.tenantId),
  ]);

  return (
    <div className="mx-auto flex w-full max-w-[720px] flex-col gap-6">
      <div className="flex flex-col gap-1">
        <h1 className="text-[1.75rem] font-semibold">Configurações</h1>
        <p className="text-ink-muted">
          Ajuste como seu estabelecimento aparece e como as pessoas agendam.
        </p>
      </div>

      <BusinessInfoForm
        initial={{
          name: tenant.name,
          whatsapp: tenant.whatsapp ?? "",
          address: tenant.address ?? "",
          instagram: tenant.instagram ?? "",
          about: tenant.about ?? "",
        }}
      />
      <BrandForm
        initial={{
          name: tenant.name,
          logoUrl: tenant.logoUrl,
          color: tenant.brandColor ?? "#3E07D2",
        }}
      />
      <HoursForm initial={hours} applyToTeamDefault={applyToTeamDefault} />
      <RulesForm
        initial={{
          slotIntervalMin: tenant.slotIntervalMin,
          minNoticeMin: tenant.minNoticeMin,
          maxDaysAhead: tenant.maxDaysAhead,
          cancelWindowMin: tenant.cancelWindowMin,
        }}
      />
      <SlugForm currentSlug={tenant.slug} />
      <Link href="/painel/configuracoes/mensagens" className="rounded-card border border-line bg-surface p-5 font-semibold text-primary">Configurar mensagens WhatsApp →</Link>
      <Link href="/painel/configuracoes/assinatura" className="rounded-card border border-line bg-surface p-5 font-semibold text-primary">Plano e faturas →</Link>
      <Link href="/painel/configuracoes/notificacoes" className="rounded-card border border-line bg-surface p-5 font-semibold text-primary">Configurar notificações do dispositivo →</Link>
      <TeamAccessCard
        members={team.map((row) =>
          row.kind === "member"
            ? row
            : {
                kind: "invite" as const,
                invitationId: row.invitationId,
                name: row.name,
                email: row.email,
                role: row.role,
                professionalName: row.professionalName,
                expired: row.expired,
              },
        )}
        professionals={invitable}
      />
    </div>
  );
}
