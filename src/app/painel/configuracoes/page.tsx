import { eq } from "drizzle-orm";
import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { getDb } from "@/db/client";
import { tenants } from "@/db/schema";
import { BrandForm } from "@/components/settings/brand-form";
import { BusinessInfoForm } from "@/components/settings/business-info-form";
import { HoursForm } from "@/components/settings/hours-form";
import { RulesForm } from "@/components/settings/rules-form";
import { SlugForm } from "@/components/settings/slug-form";
import { requireOnboarded } from "@/server/panel/onboarding-gate";
import { getBusinessHours } from "@/server/settings";

export const metadata: Metadata = { title: "Configurações" };

export default async function ConfiguracoesPage() {
  const { session } = await requireOnboarded();

  // Só o proprietário altera as configurações: os demais papéis veem o aviso.
  if (session.role !== "owner") {
    return (
      <div className="mx-auto flex w-full max-w-[720px] flex-col gap-6">
        <h1 className="text-[1.75rem] font-semibold">Configurações</h1>
        <p className="rounded-panel border border-line bg-surface p-5 leading-snug text-ink-muted sm:p-6">
          Só o proprietário pode alterar as configurações do estabelecimento.
          Fale com ele se algo precisar mudar.
        </p>
      </div>
    );
  }

  const db = await getDb();
  const [tenant] = await db
    .select()
    .from(tenants)
    .where(eq(tenants.id, session.tenantId))
    .limit(1);
  if (!tenant) redirect("/entrar");
  const hours = await getBusinessHours(db, session.tenantId);

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
      <HoursForm initial={hours} />
      <RulesForm
        initial={{
          slotIntervalMin: tenant.slotIntervalMin,
          minNoticeMin: tenant.minNoticeMin,
          maxDaysAhead: tenant.maxDaysAhead,
          cancelWindowMin: tenant.cancelWindowMin,
        }}
      />
      <SlugForm currentSlug={tenant.slug} />
    </div>
  );
}
