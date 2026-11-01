import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";
import { getDb } from "@/db/client";
import { BookingFlow } from "@/components/booking/booking-flow";
import { PublicShell, type BookingTenant } from "@/components/booking/shell";
import { loadPublicHeader } from "@/server/public/header";
import { loadPublicPageContent, toTeamMember } from "@/server/public/page-content";
import { getPublicTenant } from "@/server/public/tenant";

// Serviços, equipe e fotos mudam no painel e precisam aparecer na hora.
export const dynamic = "force-dynamic";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export async function generateMetadata({
  params,
}: PageProps<"/[slug]/profissional/[id]">): Promise<Metadata> {
  const { slug, id } = await params;
  const resolved = await getPublicTenant(slug);
  const pro = resolved?.catalog?.professionals.find((p) => p.id === id);
  if (!resolved || !pro) return { title: "Profissional não encontrado", robots: { index: false } };
  const title = `Agende com ${pro.name} · ${resolved.tenant.name}`;
  return {
    title: { absolute: title },
    description: pro.title ?? "Agende seu horário online.",
    robots: resolved.canBook ? undefined : { index: false },
  };
}

/**
 * Agendamento direto com um profissional (`/{slug}/profissional/{id}`): ele já
 * vem escolhido, a lista mostra só os serviços dele e o passo seguinte é a
 * data. Estabelecimento sem agenda aberta ou profissional que não faz nenhum
 * serviço voltam para a página principal.
 */
export default async function ProfessionalBookingPage({
  params,
}: PageProps<"/[slug]/profissional/[id]">) {
  const { slug, id } = await params;
  if (!UUID.test(id)) notFound();
  const resolved = await getPublicTenant(slug);
  if (!resolved) notFound();
  const { tenant, catalog } = resolved;
  if (!resolved.canBook || !catalog) redirect(`/${tenant.slug}`);

  const pro = catalog.professionals.find((p) => p.id === id);
  if (!pro) notFound();
  const proServices = catalog.services.filter((s) => s.professionalIds.includes(pro.id));
  const proCategoryIds = new Set(proServices.map((s) => s.categoryId));

  const db = await getDb();
  const { today, subtitle } = await loadPublicHeader(db, tenant);
  const content = await loadPublicPageContent(db, tenant, catalog);
  const bookingTenant: BookingTenant = {
    slug: tenant.slug,
    name: tenant.name,
    brandColor: tenant.brandColor,
    logoUrl: tenant.logoUrl,
    whatsapp: tenant.whatsapp,
    address: tenant.address,
    subtitle,
    timezone: tenant.timezone,
  };

  return (
    <PublicShell brandColor={tenant.brandColor}>
      <BookingFlow
        tenant={bookingTenant}
        content={content}
        lockedProfessional={toTeamMember(tenant.slug, pro)}
        categories={catalog.categories.filter((c) => proCategoryIds.has(c.id))}
        services={proServices.map(
          ({ id: serviceId, name, description, categoryId, durationMin, priceCents, professionalIds }) => ({
            id: serviceId,
            name,
            description,
            categoryId,
            durationMin,
            priceCents,
            professionalIds,
          }),
        )}
        professionals={catalog.professionals}
        today={today}
      />
    </PublicShell>
  );
}
