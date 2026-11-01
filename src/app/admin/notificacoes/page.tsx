import { and, asc, eq, lte, or } from "drizzle-orm";
import Link from "next/link";
import { pushAvailable } from "@/server/push/mode";
import { notFound } from "next/navigation";
import { getDb } from "@/db/client";
import { pushDeliveries, pushEvents, tenants } from "@/db/schema";
import { requireSuperAdminSession } from "@/server/auth/guard";
import { removeExpiredDevice, reviewDelivery } from "./actions";

function staleThreshold() { return new Date(Date.now() - 5 * 60_000); }

export default async function TestPushReviewPage() {
  if (!pushAvailable()) notFound();
  await requireSuperAdminSession();
  const stale = staleThreshold();
  const rows = await (await getDb()).select({ id: pushDeliveries.id, status: pushDeliveries.status, claimedAt: pushDeliveries.claimedAt, name: tenants.name, eventType: pushEvents.eventType })
    .from(pushDeliveries).innerJoin(tenants, eq(tenants.id, pushDeliveries.tenantId)).innerJoin(pushEvents, and(eq(pushEvents.id, pushDeliveries.eventId), eq(pushEvents.tenantId, pushDeliveries.tenantId)))
    .where(or(eq(pushDeliveries.status, "uncertain"), and(eq(pushDeliveries.status, "processing"), lte(pushDeliveries.claimedAt, stale)), and(eq(pushDeliveries.status, "expired"), eq(pushDeliveries.expirationReason, "subscription_gone"))))
    .orderBy(asc(pushDeliveries.createdAt)).limit(100);
  return <main className="mx-auto flex w-full max-w-[900px] flex-col gap-5 p-6">
    <Link href="/admin" className="text-primary">‹ Plataforma</Link><h1 className="text-2xl font-semibold">Revisar notificações de teste</h1>
    <p>O resultado pode ser incerto. Só confirme uma entrega que você verificou. Repetir pode gerar uma notificação duplicada; avisos com mais de cinco minutos expiram.</p>
    {rows.length === 0 && <p>Nenhuma ocorrência para revisar.</p>}
    {rows.map((row) => <section key={row.id} className="space-y-3 rounded-card border border-line bg-surface p-4">
      <p>{row.name} · {row.eventType}</p><p className="break-all text-sm text-ink-muted">Ocorrência: {row.id} · {row.status === "uncertain" ? "Resultado incerto" : row.status === "expired" ? "Inscrição rejeitada pelo provedor" : "Processamento interrompido"}</p>
      {row.status === "expired" ? <form action={removeExpiredDevice}><input type="hidden" name="id" value={row.id} /><button type="submit" className="rounded-field border border-line px-4 py-2">Remover inscrição rejeitada</button></form> : <form action={reviewDelivery} className="flex flex-wrap gap-3"><input type="hidden" name="id" value={row.id} /><button type="submit" name="decision" value="confirmed" className="rounded-field border border-line px-4 py-2">Confirmar entrega</button><button type="submit" name="decision" value="retry" className="rounded-field border border-line px-4 py-2">Tentar novamente</button></form>}
    </section>)}
  </main>;
}
