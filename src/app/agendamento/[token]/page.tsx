import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getDb } from "@/db/client";
import { ManageBooking } from "@/components/booking/manage-booking";
import { PublicShell } from "@/components/booking/shell";
import { loadPublicHeader } from "@/server/public/header";
import { getManageView } from "@/server/public/manage";

// O token está na URL: nada de cache, nada de indexação e nenhum referrer saindo desta página.
export const dynamic = "force-dynamic";
export const metadata: Metadata = {
  title: "Seu agendamento",
  robots: { index: false, follow: false },
  referrer: "no-referrer",
};

export default async function ManageBookingPage({ params }: PageProps<"/agendamento/[token]">) {
  const { token } = await params;
  const db = await getDb();
  const view = await getManageView(db, token);
  if (!view) notFound();

  const { tenant, booking, canChange } = view;
  const { today } = await loadPublicHeader(db, tenant);

  return (
    <PublicShell brandColor={tenant.brandColor}>
      <ManageBooking
        token={token}
        tenant={{
          slug: tenant.slug,
          name: tenant.name,
          brandColor: tenant.brandColor,
          logoUrl: tenant.logoUrl,
          whatsapp: tenant.whatsapp,
          address: tenant.address,
          subtitle: null,
          timezone: tenant.timezone,
        }}
        booking={booking}
        canChange={canChange}
        today={today}
      />
    </PublicShell>
  );
}
