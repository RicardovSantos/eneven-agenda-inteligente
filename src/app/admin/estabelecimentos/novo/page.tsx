import type { Metadata } from "next";
import { ChevronLeft } from "lucide-react";
import Link from "next/link";
import { getDb } from "@/db/client";
import { NewTenantForm } from "@/components/platform/new-tenant-form";
import { requireSuperAdminSession } from "@/server/auth/guard";
import { getDefaultPlanId, listPlans } from "@/server/platform/plans";

export const metadata: Metadata = { title: "Novo estabelecimento" };

export default async function NewTenantPage() {
  await requireSuperAdminSession();
  const db = await getDb();
  const [plans, defaultPlanId] = await Promise.all([listPlans(db), getDefaultPlanId(db)]);
  const active = plans.filter((p) => p.active);

  return (
    <main className="mx-auto flex w-full max-w-[640px] flex-col gap-5 px-4 pb-10 pt-4 lg:pt-5">
      <Link
        href="/admin"
        className="flex min-h-10 w-fit items-center gap-1 text-[0.9375rem] font-medium text-ink-muted no-underline hover:text-ink"
      >
        <ChevronLeft className="size-[18px]" aria-hidden="true" />
        Estabelecimentos
      </Link>
      <div className="flex flex-col gap-1">
        <h1 className="font-display text-[1.75rem] font-semibold">Novo estabelecimento</h1>
        <p className="text-sm text-ink-muted">
          Cria a conta e o dono, com o plano e o prazo de teste que você escolher.
        </p>
      </div>
      <NewTenantForm
        plans={active.map((p) => ({ id: p.id, name: p.name, priceCents: p.priceCents }))}
        defaultPlanId={active.some((p) => p.id === defaultPlanId) ? defaultPlanId : (active[0]?.id ?? "")}
      />
    </main>
  );
}
