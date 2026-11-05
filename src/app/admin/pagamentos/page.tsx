import type { Metadata } from "next";
import { getDb } from "@/db/client";
import { PaymentGatewaysScreen } from "@/components/platform/payment-gateways-screen";
import { requireSuperAdminSession } from "@/server/auth/guard";
import { getPaymentRouting, listGatewayChanges } from "@/server/platform/payment-gateways";

export const metadata: Metadata = { title: "Pagamentos" };

export default async function AdminPaymentsPage() {
  await requireSuperAdminSession();
  const db = await getDb();
  const [settings, changes] = await Promise.all([getPaymentRouting(db), listGatewayChanges(db)]);
  return <PaymentGatewaysScreen
    settings={settings.map((item) => ({ method: item.method, label: item.label, current: item.current, options: item.options.map((o) => ({ gateway: o.gateway, label: o.label, ready: o.readiness.ready, reason: o.readiness.reason ?? null })) }))}
    changes={changes.map((c) => ({ id: c.id, at: c.at.toISOString(), method: c.method, from: c.from, to: c.to }))}
  />;
}
