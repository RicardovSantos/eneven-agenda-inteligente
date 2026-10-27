import type { Metadata } from "next";
import { getDb } from "@/db/client";
import { PlansScreen } from "@/components/platform/plans-screen";
import { requireSuperAdminSession } from "@/server/auth/guard";
import { listPlans } from "@/server/platform/plans";

export const metadata: Metadata = { title: "Planos" };

export default async function AdminPlansPage() {
  await requireSuperAdminSession();
  const plans = await listPlans(await getDb());
  return <PlansScreen plans={plans} />;
}
