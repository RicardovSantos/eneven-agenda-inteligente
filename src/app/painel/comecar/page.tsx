import { eq } from "drizzle-orm";
import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { getDb } from "@/db/client";
import { tenants } from "@/db/schema";
import {
  OnboardingWizard,
  type WizardProfessional,
  type WizardService,
} from "@/components/onboarding/wizard";
import { listProfessionals, listServices } from "@/server/catalog";
import { getOnboardingState, onboardingRedirect } from "@/server/onboarding";
import { getPanelData } from "@/server/panel/data";
import { getBusinessHours } from "@/server/settings";

export const metadata: Metadata = { title: "Primeiros passos" };

export default async function ComecarPage() {
  const data = await getPanelData();
  // O assistente é só do proprietário; quem já concluiu (ou pulou) volta ao painel.
  const back = onboardingRedirect({
    role: data.session.role,
    completed: data.onboardingCompletedAt !== null,
    page: "wizard",
  });
  if (back) redirect(back);

  const tenantId = data.session.tenantId;
  const db = await getDb();
  const state = await getOnboardingState(db, tenantId);
  if (state.step === "done") redirect("/painel");

  const [tenant] = await db.select().from(tenants).where(eq(tenants.id, tenantId)).limit(1);
  if (!tenant) redirect("/entrar");

  const [hours, serviceRows, professionalRows] = await Promise.all([
    getBusinessHours(db, tenantId),
    listServices(db, tenantId),
    listProfessionals(db, tenantId),
  ]);

  const services: WizardService[] = serviceRows.map((s) => ({
    id: s.id,
    name: s.name,
    durationMin: s.durationMin,
    priceCents: s.priceCents,
  }));
  const professionals: WizardProfessional[] = professionalRows
    .filter((p) => p.active)
    .map((p) => ({ id: p.id, name: p.name, color: p.color }));

  return (
    <OnboardingWizard
      initialStep={state.step}
      slug={tenant.slug}
      emailVerified={data.session.emailVerified}
      userEmail={data.userEmail}
      tenant={{
        name: tenant.name,
        whatsapp: tenant.whatsapp ?? "",
        address: tenant.address ?? "",
        instagram: tenant.instagram ?? "",
        about: tenant.about ?? "",
        color: tenant.brandColor ?? "#3E07D2",
        logoUrl: tenant.logoUrl,
      }}
      hours={hours}
      services={services}
      professionals={professionals}
    />
  );
}
