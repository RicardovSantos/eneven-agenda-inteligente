import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getDb } from "@/db/client";
import { BookingFlow } from "@/components/booking/booking-flow";
import { PublicShell, type BookingTenant } from "@/components/booking/shell";
import { Unavailable } from "@/components/booking/unavailable";
import { loadPublicHeader } from "@/server/public/header";
import { getPublicTenant, type PublicTenant } from "@/server/public/tenant";

// Nome, cor, slug e serviços mudam no painel e precisam aparecer na hora: nada de cache estático.
export const dynamic = "force-dynamic";

export async function generateMetadata({ params }: PageProps<"/[slug]">): Promise<Metadata> {
  const { slug } = await params;
  const resolved = await getPublicTenant(slug);
  if (!resolved) return { title: "Estabelecimento não encontrado", robots: { index: false } };

  const { tenant } = resolved;
  const title = `Agende no ${tenant.name}`;
  const description = tenant.about?.trim() || "Agende seu horário online.";
  return {
    title: { absolute: title },
    description,
    robots: resolved.canBook ? undefined : { index: false },
    openGraph: { type: "website", locale: "pt_BR", title, description },
    twitter: { card: "summary_large_image", title, description },
  };
}

function toBookingTenant(tenant: PublicTenant, subtitle: string | null): BookingTenant {
  return {
    slug: tenant.slug,
    name: tenant.name,
    brandColor: tenant.brandColor,
    logoUrl: tenant.logoUrl,
    whatsapp: tenant.whatsapp,
    address: tenant.address,
    subtitle,
    timezone: tenant.timezone,
  };
}

export default async function PublicBookingPage({ params }: PageProps<"/[slug]">) {
  const { slug } = await params;
  const resolved = await getPublicTenant(slug);
  if (!resolved) notFound();

  const db = await getDb();
  const { tenant } = resolved;
  const { today, subtitle } = await loadPublicHeader(db, tenant);
  const bookingTenant = toBookingTenant(tenant, subtitle);

  if (!resolved.canBook || !resolved.catalog) {
    return (
      <PublicShell brandColor={tenant.brandColor}>
        <Unavailable tenant={bookingTenant} />
      </PublicShell>
    );
  }

  const { catalog } = resolved;
  return (
    <PublicShell brandColor={tenant.brandColor}>
      <BookingFlow
        tenant={bookingTenant}
        services={catalog.services.map(({ id, name, durationMin, priceCents, professionalIds }) => ({
          id,
          name,
          durationMin,
          priceCents,
          professionalIds,
        }))}
        professionals={catalog.professionals}
        today={today}
      />
    </PublicShell>
  );
}
